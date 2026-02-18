export const dynamic = "force-dynamic";

import { createPublicClient, http, isAddress } from "viem";
import { bscTestnet } from "viem/chains";
import {
  NFARegistryABI,
  SIBBondManagerABI,
  SIBControllerV2ABI,
  DividendVaultV2ABI,
} from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const nfaAbi = NFARegistryABI;
const bondAbi = SIBBondManagerABI;
const controllerAbi = SIBControllerV2ABI;
const dividendAbi = DividendVaultV2ABI;

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address || !isAddress(address)) {
      return new Response(
        JSON.stringify({ positions: [], totals: { portfolioValue: "0", totalClaimable: "0" } }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const holderAddress = address as `0x${string}`;

    // Get all agents to find those with IPOs
    const totalSupply = (await client.readContract({
      address: ADDRESSES.NFARegistry,
      abi: nfaAbi,
      functionName: "totalSupply",
    })) as bigint;

    const count = Number(totalSupply);
    if (count === 0) {
      return new Response(
        JSON.stringify({ positions: [], totals: { portfolioValue: "0", totalClaimable: "0" } }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const positions = [];
    let totalClaimable = BigInt(0);

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

        const [bondClass, nonceCount, metadata, rating] = (await Promise.all([
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
        ])) as [BondClass, bigint, AgentMetadata, number];

        const nonceTotal = Number(nonceCount);

        for (let n = 0; n < nonceTotal; n++) {
          try {
            const balance = (await client.readContract({
              address: ADDRESSES.SIBBondManager,
              abi: bondAbi,
              functionName: "balanceOf",
              args: [holderAddress, classId, BigInt(n)],
            })) as bigint;

            if (balance === BigInt(0)) continue;

            const [nonce, claimable] = (await Promise.all([
              client.readContract({
                address: ADDRESSES.SIBBondManager,
                abi: bondAbi,
                functionName: "bondNonces",
                args: [classId, BigInt(n)],
              }),
              client.readContract({
                address: ADDRESSES.DividendVaultV2,
                abi: dividendAbi,
                functionName: "claimable",
                args: [holderAddress, classId, BigInt(n), "0x0000000000000000000000000000000000000000" as `0x${string}`],
              }),
            ])) as [BondNonce, bigint];

            totalClaimable += claimable;

            positions.push({
              classId: Number(classId),
              nonceId: n,
              agentId: Number(bondClass.agentId),
              agentName: metadata.name,
              balance: balance.toString(),
              pricePerBond: nonce.pricePerBond.toString(),
              couponRateBps: Number(bondClass.couponRateBps),
              maturityTimestamp: Number(nonce.maturityTimestamp),
              redeemable: nonce.redeemable,
              claimableDividends: claimable.toString(),
              creditRating: CREDIT_LABELS[rating] ?? "Unrated",
            });
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }

    // Calculate total portfolio value (balance * pricePerBond for each position)
    let portfolioValue = BigInt(0);
    for (const pos of positions) {
      portfolioValue += BigInt(pos.balance) * BigInt(pos.pricePerBond);
    }

    return new Response(
      JSON.stringify({
        positions,
        totals: {
          portfolioValue: portfolioValue.toString(),
          totalClaimable: totalClaimable.toString(),
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Failed to fetch portfolio", detail: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
