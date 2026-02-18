import {
  LiquidationTriggered,
  LiquidationExecuted,
  LiquidationCancelled,
} from "../../generated/LiquidationEngine/LiquidationEngine";
import { Liquidation } from "../../generated/schema";

export function handleLiquidationTriggered(event: LiquidationTriggered): void {
  let id = event.params.agentId.toString();
  let liquidation = new Liquidation(id);
  liquidation.agentId = event.params.agentId;
  liquidation.gracePeriodEnd = event.params.gracePeriodEnd;
  liquidation.executed = false;
  liquidation.cancelled = false;
  liquidation.triggeredAt = event.block.timestamp;
  liquidation.save();
}

export function handleLiquidationExecuted(event: LiquidationExecuted): void {
  let id = event.params.agentId.toString();
  let liquidation = Liquidation.load(id);
  if (liquidation) {
    liquidation.executed = true;
    liquidation.save();
  }
}

export function handleLiquidationCancelled(event: LiquidationCancelled): void {
  let id = event.params.agentId.toString();
  let liquidation = Liquidation.load(id);
  if (liquidation) {
    liquidation.cancelled = true;
    liquidation.save();
  }
}
