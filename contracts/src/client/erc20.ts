import { Contract, type ContractRunner } from "ethers";

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
] as const;

export function getErc20(token: string, runner: ContractRunner) {
  return new Contract(token, ERC20_ABI, runner);
}

export async function approveIfNeeded(params: {
  token: string;
  owner: string;
  spender: string;
  amount: bigint;
  runner: ContractRunner;
}) {
  const erc20 = getErc20(params.token, params.runner);
  const current: bigint = await erc20.allowance(params.owner, params.spender);
  if (current >= params.amount) return null;
  return erc20.approve(params.spender, params.amount);
}
