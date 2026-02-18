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

type BondClass = {
  agentId: bigint;
  couponRateBps: bigint;
  maturityPeriod: bigint;
  sharpeRatioAtIssue: bigint;
  maxSupply: bigint;
  exists: boolean;
};

type BondNonce = {
  issueTimestamp: bigint;
  maturityTimestamp: bigint;
  totalIssued: bigint;
  pricePerBond: bigint;
  redeemable: boolean;
  exists: boolean;
};

type AgentMetadata = {
  name: string;
  description: string;
  modelHash: string;
  endpoint: string;
  registeredAt: bigint;
};

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

        const classId = (await client.readContract({
          address: ADDRESSES.SIBControllerV2,
          abi: controllerAbi,
          functionName: "agentBondClass",
          args: [tokenId],
        })) as bigint;

        const [bondClass, nonceCount, metadata, rating, activeNonce] =
          (await Promise.all([
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
            client.readContract({
              address: ADDRESSES.SIBControllerV2,
              abi: controllerAbi,
              functionName: "activeNonce",
              args: [classId],
            }),
          ])) as [BondClass, bigint, AgentMetadata, number, bigint];

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
            })) as BondNonce;

            nonces.push({
              nonceId: n,
              issueTimestamp: Number(nonce.issueTimestamp),
              maturityTimestamp: Number(nonce.maturityTimestamp),
              totalIssued: nonce.totalIssued.toString(),
              pricePerBond: nonce.pricePerBond.toString(),
              redeemable: nonce.redeemable,
              exists: nonce.exists,
            });
          } catch {
            continue;
          }
        }

        bondClasses.push({
          classId: Number(classId),
          agentId: Number(bondClass.agentId),
          agentName: metadata.name,
          couponRateBps: Number(bondClass.couponRateBps),
          maturityPeriod: Number(bondClass.maturityPeriod),
          sharpeRatioAtIssue: Number(bondClass.sharpeRatioAtIssue),
          maxSupply: bondClass.maxSupply.toString(),
          creditRating: CREDIT_LABELS[rating] ?? "Unrated",
          activeNonce: Number(activeNonce),
          nonces,
        });
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
