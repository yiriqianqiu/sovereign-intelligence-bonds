export const dynamic = "force-dynamic";

import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import {
  NFARegistryABI,
  SIBBondManagerABI,
  SIBControllerV2ABI,
} from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const nfaAbi = NFARegistryABI;
const bondAbi = SIBBondManagerABI;
const controllerAbi = SIBControllerV2ABI;

const CREDIT_LABELS = ["Unrated", "C", "B", "A", "AA", "AAA"] as const;

type BondClassTuple = readonly [bigint, bigint, bigint, bigint, bigint, boolean];
type BondNonceTuple = readonly [bigint, bigint, bigint, bigint, boolean, boolean];
type AgentMetadataTuple = readonly [string, string, string, string, bigint];

export async function GET() {
  try {
    const totalSupply = (await client.readContract({
      address: ADDRESSES.NFARegistry,
      abi: nfaAbi,
      functionName: "totalSupply",
    })) as bigint;

    const count = Number(totalSupply);
    if (count === 0) {
      return new Response(JSON.stringify({ bondClasses: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const bondClasses = [];

    for (let i = 0; i < count; i++) {
      try {
        const tokenId = (await client.readContract({
          address: ADDRESSES.NFARegistry,
          abi: nfaAbi,
          functionName: "tokenByIndex",
          args: [BigInt(i)],
        })) as bigint;

        const hasIPO = (await client.readContract({
          address: ADDRESSES.SIBControllerV2,
          abi: controllerAbi,
          functionName: "hasIPO",
          args: [tokenId],
        })) as boolean;

        if (!hasIPO) continue;

        // v2: get all bond class IDs for this agent
        const classIds = (await client.readContract({
          address: ADDRESSES.SIBControllerV2,
          abi: controllerAbi,
          functionName: "getAgentBondClasses",
          args: [tokenId],
        })) as bigint[];

        if (!classIds || classIds.length === 0) continue;

        const [metadata, rating] = (await Promise.all([
          client.readContract({
            address: ADDRESSES.NFARegistry,
            abi: nfaAbi,
            functionName: "getAgentMetadata",
            args: [tokenId],
          }),
          client.readContract({
            address: ADDRESSES.NFARegistry,
            abi: nfaAbi,
            functionName: "creditRatings",
            args: [tokenId],
          }),
        ])) as [AgentMetadataTuple, number];

        for (const classId of classIds) {
          try {
            const [bondClass, nonceCount, activeNonceVal] = (await Promise.all([
              client.readContract({
                address: ADDRESSES.SIBBondManager,
                abi: bondAbi,
                functionName: "bondClasses",
                args: [classId],
              }),
              client.readContract({
                address: ADDRESSES.SIBBondManager,
                abi: bondAbi,
                functionName: "nextNonceId",
                args: [classId],
              }),
              client.readContract({
                address: ADDRESSES.SIBControllerV2,
                abi: controllerAbi,
                functionName: "activeNonce",
                args: [classId],
              }),
            ])) as [BondClassTuple, bigint, bigint];

            // Read all nonces for this class
            const nonces = [];
            const nonceTotal = Number(nonceCount);

            for (let n = 0; n < nonceTotal; n++) {
              try {
                const nonce = (await client.readContract({
                  address: ADDRESSES.SIBBondManager,
                  abi: bondAbi,
                  functionName: "bondNonces",
                  args: [classId, BigInt(n)],
                })) as BondNonceTuple;

                nonces.push({
                  nonceId: n,
                  issueTimestamp: Number(nonce[0]),
                  maturityTimestamp: Number(nonce[1]),
                  totalIssued: nonce[2].toString(),
                  pricePerBond: nonce[3].toString(),
                  redeemable: nonce[4],
                  exists: nonce[5],
                });
              } catch {
                continue;
              }
            }

            bondClasses.push({
              classId: Number(classId),
              agentId: Number(bondClass[0]),
              agentName: metadata[0],
              couponRateBps: Number(bondClass[1]),
              maturityPeriod: Number(bondClass[2]),
              sharpeRatioAtIssue: Number(bondClass[3]),
              maxSupply: bondClass[4].toString(),
              creditRating: CREDIT_LABELS[rating] ?? "Unrated",
              activeNonce: Number(activeNonceVal),
              nonces,
            });
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }

    return new Response(JSON.stringify({ bondClasses }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Failed to fetch bonds", detail: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
