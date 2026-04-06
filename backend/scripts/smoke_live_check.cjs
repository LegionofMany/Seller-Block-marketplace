const fs = require("node:fs");
const path = require("node:path");
const { Wallet, JsonRpcProvider, Contract, Interface, ZeroAddress, parseEther } = require("ethers");

const BACKEND_URL = "https://seller-block-marketplace-4.onrender.com";
const SEPOLIA_RPC_FALLBACK_URL = "https://eth-sepolia.g.alchemy.com/v2/aEg0vCMBDP59_5_j2Ga02XSoAGiW_spr";
const REGISTRY_ABI = [
  "function createListing(string metadataURI,uint256 price,address token,uint8 saleType) returns (bytes32 listingId)",
  "function cancelListing(bytes32 listingId)",
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)",
];

function readEnvFile(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    env[key] = value;
  }
  return env;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(typeof data === "object" && data?.error?.message ? data.error.message : `${response.status} ${response.statusText}: ${text}`);
  }
  return data;
}

async function poll(label, timeoutMs, intervalMs, task) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await task();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  if (lastError) {
    throw new Error(`${label} timed out: ${lastError.message}`);
  }
  throw new Error(`${label} timed out`);
}

async function createTempMailbox() {
  try {
    const mailbox = await fetchJson("https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1");
    const address = Array.isArray(mailbox) ? mailbox[0] : null;
    if (address && address.includes("@")) {
      const [login, domain] = address.split("@");
      return { provider: "1secmail", address, login, domain };
    }
  } catch {
    // fall through to mail.tm
  }

  const domains = await fetchJson("https://api.mail.tm/domains?page=1");
  const domain = domains?.["hydra:member"]?.[0]?.domain;
  if (!domain) {
    throw new Error("mail.tm returned no active domains");
  }

  const local = `sellerblock.${Date.now()}`;
  const address = `${local}@${domain}`;
  const password = `Pw-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await fetchJson("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address, password }),
  });

  const token = await fetchJson("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address, password }),
  });

  return { provider: "mail.tm", address, token: token.token };
}

async function listTempMailboxMessages(mailbox) {
  if (mailbox.provider === "1secmail") {
    return fetchJson(`https://www.1secmail.com/api/v1/?action=getMessages&login=${encodeURIComponent(mailbox.login)}&domain=${encodeURIComponent(mailbox.domain)}`);
  }

  const result = await fetchJson("https://api.mail.tm/messages?page=1", {
    headers: { Accept: "application/json", Authorization: `Bearer ${mailbox.token}` },
  });
  return result?.["hydra:member"] ?? [];
}

async function readTempMailboxMessage(mailbox, id) {
  if (mailbox.provider === "1secmail") {
    return fetchJson(`https://www.1secmail.com/api/v1/?action=readMessage&login=${encodeURIComponent(mailbox.login)}&domain=${encodeURIComponent(mailbox.domain)}&id=${id}`);
  }

  return fetchJson(`https://api.mail.tm/messages/${id}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${mailbox.token}` },
  });
}

(async () => {
  const repoRoot = path.resolve(__dirname, "..");
  const contractsEnv = readEnvFile(path.resolve(repoRoot, "..", "contracts", ".env"));
  const privateKey = contractsEnv.PRIVATE_KEY;
  const rpcUrl = contractsEnv.SEPOLIA_RPC_URL;
  const registryAddress = contractsEnv.REGISTRY_ADDRESS;

  if (!privateKey || !rpcUrl || !registryAddress) {
    throw new Error("Missing PRIVATE_KEY, SEPOLIA_RPC_URL, or REGISTRY_ADDRESS in contracts/.env");
  }

  const provider = new JsonRpcProvider(SEPOLIA_RPC_FALLBACK_URL || rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const registry = new Contract(registryAddress, REGISTRY_ABI, wallet);
  const iface = new Interface(REGISTRY_ABI);
  const address = await wallet.getAddress();
  const runId = `smoke-${Date.now()}`;
  const title = `Smoke Listing ${runId}`;
  const summary = {
    backendUrl: BACKEND_URL,
    walletAddress: address,
    steps: {},
    mailbox: null,
    listingId: null,
    notificationId: null,
    emailMessageId: null,
    cleanup: {},
  };

  console.log(`Using wallet ${address}`);
  const balance = await provider.getBalance(address);
  summary.steps.walletBalanceWei = balance.toString();
  console.log(`Wallet balance: ${balance.toString()} wei`);

  let mailbox = null;
  try {
    mailbox = await createTempMailbox();
    summary.mailbox = mailbox.address;
    console.log(`Temp mailbox (${mailbox.provider}): ${mailbox.address}`);
  } catch (error) {
    summary.steps.tempMailbox = { status: "unavailable", message: error.message };
    console.log(`Temp mailbox unavailable: ${error.message}`);
  }

  const nonceRes = await fetchJson(`${BACKEND_URL}/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address }),
  });
  const signature = await wallet.signMessage(nonceRes.message);
  const verifyRes = await fetchJson(`${BACKEND_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ address, nonce: nonceRes.nonce, signature }),
  });
  const token = verifyRes.token;
  const meRes = await fetchJson(`${BACKEND_URL}/auth/me`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  summary.steps.auth = {
    nonceIssued: Boolean(nonceRes?.nonce),
    tokenIssued: Boolean(token),
    meAddress: meRes.address,
  };
  console.log(`Auth verified for ${meRes.address}`);

  const savedSearchRes = await fetchJson(`${BACKEND_URL}/saved-searches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: `Saved search ${runId}`,
      email: mailbox?.address ?? "",
      filters: {
        q: title,
      },
    }),
  });
  const savedSearchId = savedSearchRes.item.id;
  summary.steps.savedSearch = { id: savedSearchId, email: mailbox?.address ?? null };
  console.log(`Saved search created: ${savedSearchId}`);

  const metadataRes = await fetchJson(`${BACKEND_URL}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      title,
      description: `Live smoke listing for ${runId}`,
      images: ["https://via.placeholder.com/1200x800.png?text=Seller+Block+Smoke"],
      category: "Electronics",
      subcategory: "Phones",
      city: "Portland",
      region: "OR",
      postalCode: "97201",
      contactEmail: mailbox?.address ?? undefined,
      attributes: [],
    }),
  });
  summary.steps.metadata = metadataRes;
  console.log(`Metadata created: ${metadataRes.metadataURI}`);

  const tx = await registry.createListing(metadataRes.metadataURI, parseEther("0.0001"), ZeroAddress, 0);
  console.log(`createListing tx: ${tx.hash}`);
  const receipt = await tx.wait();
  let listingId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "ListingCreated") {
        listingId = parsed.args.id;
        break;
      }
    } catch {
      // ignore
    }
  }
  if (!listingId) throw new Error("ListingCreated event not found in receipt");
  summary.listingId = listingId;
  summary.steps.createListing = { txHash: tx.hash, blockNumber: receipt.blockNumber, listingId };
  console.log(`Listing created: ${listingId}`);

  const listingRead = await poll(
    "listing read",
    120000,
    5000,
    async () => {
      const result = await fetchJson(`${BACKEND_URL}/listings/${listingId}?chain=sepolia`, {
        headers: { Accept: "application/json" },
      });
      return result?.listing?.id === listingId ? result : null;
    }
  );
  summary.steps.listingRead = {
    listingId: listingRead.listing.id,
    seller: listingRead.listing.seller,
    active: listingRead.listing.active,
    metadataURI: listingRead.listing.metadataURI,
  };
  console.log(`Listing readable from backend`);

  const commentsBefore = await fetchJson(`${BACKEND_URL}/listings/${listingId}/comments?chain=sepolia&limit=20&offset=0`, {
    headers: { Accept: "application/json" },
  });
  const commentText = `Smoke comment ${runId}`;
  const commentPost = await fetchJson(`${BACKEND_URL}/listings/${listingId}/comments?chain=sepolia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ body: commentText }),
  });
  const commentsAfter = await fetchJson(`${BACKEND_URL}/listings/${listingId}/comments?chain=sepolia&limit=20&offset=0`, {
    headers: { Accept: "application/json" },
  });
  const postedComment = (commentsAfter.items || []).find((item) => item.id === commentPost.item.id);
  if (!postedComment) {
    throw new Error("Posted comment not returned by comments listing endpoint");
  }
  summary.steps.comments = {
    beforeCount: Array.isArray(commentsBefore.items) ? commentsBefore.items.length : 0,
    afterCount: Array.isArray(commentsAfter.items) ? commentsAfter.items.length : 0,
    postedCommentId: commentPost.item.id,
  };
  console.log(`Comment posted: ${commentPost.item.id}`);

  const notificationRes = await poll(
    "saved-search notification",
    180000,
    10000,
    async () => {
      const result = await fetchJson(`${BACKEND_URL}/notifications?limit=50`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const match = (result.items || []).find(
        (item) => item.type === "saved_search_match" && item.payload?.listingId === listingId
      );
      return match ? { result, match } : null;
    }
  );
  summary.notificationId = notificationRes.match.id;
  summary.steps.notifications = {
    unreadCount: notificationRes.result.unreadCount,
    matchId: notificationRes.match.id,
    matchType: notificationRes.match.type,
  };
  console.log(`Notification observed: ${notificationRes.match.id}`);

  if (mailbox) {
    try {
      const emailMatch = await poll(
        "saved-search email",
        180000,
        10000,
        async () => {
          const messages = await listTempMailboxMessages(mailbox);
          const hit = (messages || []).find((item) => {
            const subject = String(item.subject || "");
            return subject.includes("Seller Block alert") || subject.includes(runId);
          });
          return hit || null;
        }
      );
      const fullMessage = await readTempMailboxMessage(mailbox, emailMatch.id);
      summary.emailMessageId = emailMatch.id;
      summary.steps.email = {
        status: "received",
        subject: emailMatch.subject,
        from: emailMatch.from?.address ?? emailMatch.from,
        preview: fullMessage.text || fullMessage.textBody || fullMessage.html || fullMessage.htmlBody || null,
      };
      console.log(`Email observed: ${emailMatch.subject}`);
    } catch (error) {
      summary.steps.email = { status: "not-observed", message: error.message };
      console.log(`Email not observed: ${error.message}`);
    }
  } else {
    summary.steps.email = { status: "skipped", message: "No temp mailbox available" };
  }

  try {
    const cancelTx = await registry.cancelListing(listingId);
    const cancelReceipt = await cancelTx.wait(1, 180000);
    summary.cleanup.listingCancelled = { txHash: cancelTx.hash, blockNumber: cancelReceipt.blockNumber };
    console.log(`Listing cancelled: ${listingId}`);
  } catch (error) {
    summary.cleanup.listingCancelled = { error: error.message };
    console.log(`Listing cancel failed: ${error.message}`);
  }

  try {
    await fetchJson(`${BACKEND_URL}/saved-searches/${savedSearchId}`, {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    summary.cleanup.savedSearchDeleted = true;
    console.log(`Saved search deleted: ${savedSearchId}`);
  } catch (error) {
    summary.cleanup.savedSearchDeleted = { error: error.message };
    console.log(`Saved search delete failed: ${error.message}`);
  }

  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error("SMOKE_CHECK_FAILED");
  console.error(error);
  process.exit(1);
});
