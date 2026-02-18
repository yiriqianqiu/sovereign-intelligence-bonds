import { BigInt } from "@graphprotocol/graph-ts";
import {
  OrderCreated,
  OrderFilled,
  OrderCancelled,
} from "../../generated/BondDEX/BondDEX";
import { DEXOrder, ProtocolStats } from "../../generated/schema";

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

export function handleOrderCreated(event: OrderCreated): void {
  let id = event.params.orderId.toString();
  let order = new DEXOrder(id);
  order.orderId = event.params.orderId;
  order.maker = event.params.maker;
  order.classId = event.params.classId;
  order.nonceId = event.params.nonceId;
  order.amount = event.params.amount;
  order.filledAmount = BigInt.fromI32(0);
  order.pricePerBond = event.params.pricePerBond;
  order.isSell = event.params.isSell;
  order.active = true;
  order.createdAt = event.block.timestamp;
  order.save();

  let stats = getOrCreateStats();
  stats.totalOrders = stats.totalOrders.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleOrderFilled(event: OrderFilled): void {
  let id = event.params.orderId.toString();
  let order = DEXOrder.load(id);
  if (order) {
    order.filledAmount = order.filledAmount.plus(event.params.amount);
    if (order.filledAmount.ge(order.amount)) {
      order.active = false;
    }
    order.save();
  }
}

export function handleOrderCancelled(event: OrderCancelled): void {
  let id = event.params.orderId.toString();
  let order = DEXOrder.load(id);
  if (order) {
    order.active = false;
    order.save();
  }
}
