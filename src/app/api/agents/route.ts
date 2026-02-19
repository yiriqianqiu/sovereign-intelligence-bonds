export const dynamic = "force-dynamic";

import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { NFARegistryABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const abi = NFARegistryABI;

const CREDIT_LABELS = ["Unrated", "C", "B", "A", "AA", "AAA"] as const;
const STATE_LABELS = ["Registered", "Active", "Suspended", "Deregistered"] as const;

// Return types are positional tuples from abitype
type AgentMetadataTuple = readonly [string, string, string, string, bigint];
type RevenueProfileTuple = readonly [bigint, bigint, bigint, bigint, `0x${string}`];

export async function GET() {
  try {
    const totalSupply = (await client.readContract({
      address: ADDRESSES.NFARegistry,
      abi,
      functionName: "totalSupply",
    })) as bigint;

    const count = Number(totalSupply);
    if (count === 0) {
      return new Response(JSON.stringify({ agents: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const agents = [];

    for (let i = 0; i < count; i++) {
      try {
        const tokenId = (await client.readContract({
          address: ADDRESSES.NFARegistry,
          abi,
          functionName: "tokenByIndex",
          args: [BigInt(i)],
        })) as bigint;

        const [metadata, state, rating, revenue, owner] = (await Promise.all([
          client.readContract({
            address: ADDRESSES.NFARegistry,
            abi,
            functionName: "getAgentMetadata",
            args: [tokenId],
          }),
          client.readContract({
            address: ADDRESSES.NFARegistry,
            abi,
            functionName: "getAgentState",
            args: [tokenId],
          }),
          client.readContract({
            address: ADDRESSES.NFARegistry,
            abi,
            functionName: "creditRatings",
            args: [tokenId],
          }),
          client.readContract({
            address: ADDRESSES.NFARegistry,
            abi,
            functionName: "getRevenueProfile",
            args: [tokenId],
          }),
          client.readContract({
            address: ADDRESSES.NFARegistry,
            abi,
            functionName: "ownerOf",
            args: [tokenId],
          }),
        ])) as [AgentMetadataTuple, number, number, RevenueProfileTuple, string];

        agents.push({
          id: Number(tokenId),
          name: metadata[0],
          description: metadata[1],
          modelHash: metadata[2],
          endpoint: metadata[3],
          registeredAt: Number(metadata[4]),
          state: STATE_LABELS[state] ?? "Unknown",
          stateRaw: state,
          creditRating: CREDIT_LABELS[rating] ?? "Unrated",
          creditRatingRaw: rating,
          totalEarned: revenue[0].toString(),
          totalPayments: Number(revenue[1]),
          lastPaymentTime: Number(revenue[2]),
          sharpeRatio: Number(revenue[3]),
          sharpeProofHash: revenue[4],
          owner,
        });
      } catch {
        // Skip agents that fail to read (e.g. burned tokens)
        continue;
      }
    }

    return new Response(JSON.stringify({ agents }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Failed to fetch agents", detail: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
