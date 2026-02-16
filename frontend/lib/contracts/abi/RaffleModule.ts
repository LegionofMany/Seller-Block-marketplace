export const raffleModuleAbi = [
  {
    type: "function",
    name: "quoteEntry",
    stateMutability: "view",
    inputs: [
      { name: "raffleId", type: "bytes32" },
      { name: "ticketCount", type: "uint32" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
] as const;
