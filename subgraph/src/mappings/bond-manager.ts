import { BigInt } from "@graphprotocol/graph-ts";
import {
  BondClassCreated,
  BondNonceCreated,
  BondMarkedRedeemable,
} from "../../generated/SIBBondManager/SIBBondManager";
import { BondClass, BondNonce, ProtocolStats } from "../../generated/schema";

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

export function handleBondClassCreated(event: BondClassCreated): void {
  let classId = event.params.classId;
  let id = classId.toString();
  let bondClass = new BondClass(id);
  bondClass.agent = event.params.agentId.toString();
  bondClass.agentId = event.params.agentId;
  bondClass.classId = classId;
  bondClass.couponRateBps = event.params.couponRateBps;
  bondClass.maturityPeriod = event.params.maturityPeriod;
  bondClass.sharpeAtIssue = event.params.sharpeRatioAtIssue;
  bondClass.maxSupply = event.params.maxSupply;
  bondClass.tranche = event.params.tranche;
  bondClass.paymentToken = event.params.paymentToken;
  bondClass.createdAt = event.block.timestamp;
  bondClass.save();

  let stats = getOrCreateStats();
  stats.totalBondClasses = stats.totalBondClasses.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleBondNonceCreated(event: BondNonceCreated): void {
  let id = event.params.classId.toString() + "-" + event.params.nonceId.toString();
  let nonce = new BondNonce(id);
  nonce.bondClass = event.params.classId.toString();
  nonce.nonceId = event.params.nonceId;
  nonce.pricePerBond = event.params.pricePerBond;
  nonce.redeemable = false;
  nonce.createdAt = event.block.timestamp;
  nonce.save();
}

export function handleBondMarkedRedeemable(event: BondMarkedRedeemable): void {
  let id = event.params.classId.toString() + "-" + event.params.nonceId.toString();
  let nonce = BondNonce.load(id);
  if (nonce) {
    nonce.redeemable = true;
    nonce.save();
  }
}
