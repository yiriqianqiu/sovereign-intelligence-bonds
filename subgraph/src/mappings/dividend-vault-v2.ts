import { BigInt } from "@graphprotocol/graph-ts";
import {
  DividendDeposited,
  DividendClaimed,
  WaterfallDistributed,
} from "../../generated/DividendVaultV2/DividendVaultV2";
import { DividendDistribution, DividendClaim, ProtocolStats } from "../../generated/schema";

function getOrCreateStats(): ProtocolStats {
  let stats = ProtocolStats.load("global");
  if (!stats) {
    stats = new ProtocolStats("global");
    stats.totalAgents = BigInt.fromI32(0);
    stats.totalBondClasses = BigInt.fromI32(0);
    stats.totalOrders = BigInt.fromI32(0);
    stats.totalRevenue = BigInt.fromI32(0);
    stats.totalDividends = BigInt.fromI32(0);
  }
  return stats;
}

export function handleDividendDeposited(event: DividendDeposited): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let dist = new DividendDistribution(id);
  dist.classId = event.params.classId;
  dist.nonceId = event.params.nonceId;
  dist.token = event.params.token;
  dist.amount = event.params.amount;
  dist.accPerBond = event.params.accPerBond;
  dist.timestamp = event.block.timestamp;
  dist.save();

  let stats = getOrCreateStats();
  stats.totalDividends = stats.totalDividends.plus(event.params.amount);
  stats.save();
}

export function handleDividendClaimed(event: DividendClaimed): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let claim = new DividendClaim(id);
  claim.holder = event.params.holder;
  claim.classId = event.params.classId;
  claim.nonceId = event.params.nonceId;
  claim.token = event.params.token;
  claim.amount = event.params.amount;
  claim.timestamp = event.block.timestamp;
  claim.save();
}

export function handleWaterfallDistributed(event: WaterfallDistributed): void {
  let id = event.transaction.hash.toHexString() + "-senior-" + event.logIndex.toString();
  let dist = new DividendDistribution(id);
  dist.classId = event.params.seniorClassId;
  dist.nonceId = BigInt.fromI32(0);
  dist.token = event.address;
  dist.amount = event.params.seniorAmount;
  dist.accPerBond = BigInt.fromI32(0);
  dist.timestamp = event.block.timestamp;
  dist.save();
}
