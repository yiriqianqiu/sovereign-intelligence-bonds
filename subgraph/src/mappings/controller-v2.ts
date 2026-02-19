import { BigInt } from "@graphprotocol/graph-ts";
import {
  IPOInitiated,
  TranchedIPOInitiated,
  BondsPurchased,
  B402RevenueReceived,
  DividendsDistributed,
  SharpeProofVerified,
  BondsRedeemed,
  BondsTransferred,
} from "../../generated/SIBControllerV2/SIBControllerV2";
import { IPO, Purchase, RevenueEvent, ProtocolStats } from "../../generated/schema";

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

export function handleIPOInitiated(event: IPOInitiated): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let ipo = new IPO(id);
  ipo.agentId = event.params.agentId;
  ipo.classId = event.params.classId;
  ipo.nonceId = event.params.nonceId;
  ipo.couponRateBps = event.params.couponRateBps;
  ipo.pricePerBond = event.params.pricePerBond;
  ipo.paymentToken = event.params.paymentToken;
  ipo.timestamp = event.block.timestamp;
  ipo.save();
}

export function handleTranchedIPOInitiated(event: TranchedIPOInitiated): void {
  let id = event.transaction.hash.toHexString() + "-senior-" + event.logIndex.toString();
  let ipo = new IPO(id);
  ipo.agentId = event.params.agentId;
  ipo.classId = event.params.seniorClassId;
  ipo.nonceId = BigInt.fromI32(0);
  ipo.couponRateBps = BigInt.fromI32(0);
  ipo.pricePerBond = BigInt.fromI32(0);
  ipo.paymentToken = event.address;
  ipo.timestamp = event.block.timestamp;
  ipo.save();
}

export function handleBondsPurchased(event: BondsPurchased): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let purchase = new Purchase(id);
  purchase.buyer = event.params.buyer;
  purchase.classId = event.params.classId;
  purchase.nonceId = event.params.nonceId;
  purchase.amount = event.params.amount;
  purchase.totalCost = event.params.totalCost;
  purchase.paymentToken = event.params.paymentToken;
  purchase.timestamp = event.block.timestamp;
  purchase.save();
}

export function handleB402RevenueReceived(event: B402RevenueReceived): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let revenue = new RevenueEvent(id);
  revenue.agentId = event.params.agentId;
  revenue.token = event.params.token;
  revenue.amount = event.params.amount;
  revenue.bondholderShare = event.params.bondholderShare;
  revenue.ownerShare = event.params.ownerShare;
  revenue.timestamp = event.block.timestamp;
  revenue.save();

  let stats = getOrCreateStats();
  stats.totalRevenue = stats.totalRevenue.plus(event.params.amount);
  stats.save();
}

export function handleDividendsDistributed(event: DividendsDistributed): void {
  // Tracked via DividendVaultV2 events for detailed info
}

export function handleSharpeProofVerified(event: SharpeProofVerified): void {
  // Tracked via NFARegistry SharpeUpdated event
}

export function handleBondsRedeemed(event: BondsRedeemed): void {
  // Bond redemption tracked for analytics purposes
}

export function handleBondsTransferred(event: BondsTransferred): void {
  // Bond transfer tracked for analytics purposes
}
