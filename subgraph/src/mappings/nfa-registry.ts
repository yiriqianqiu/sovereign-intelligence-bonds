import { BigInt } from "@graphprotocol/graph-ts";
import {
  AgentRegistered,
  AgentStateChanged,
  CreditRatingUpdated,
  CreditFactorsUpdated,
  SharpeUpdated,
  RevenueRecorded,
} from "../../generated/NFARegistry/NFARegistry";
import { Agent, ProtocolStats } from "../../generated/schema";

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

export function handleAgentRegistered(event: AgentRegistered): void {
  let id = event.params.agentId.toString();
  let agent = new Agent(id);
  agent.owner = event.params.owner;
  agent.name = event.params.name;
  agent.description = "";
  agent.state = 0;
  agent.creditRating = 0;
  agent.sharpeRatio = BigInt.fromI32(0);
  agent.totalEarned = BigInt.fromI32(0);
  agent.createdAt = event.block.timestamp;
  agent.updatedAt = event.block.timestamp;
  agent.save();

  let stats = getOrCreateStats();
  stats.totalAgents = stats.totalAgents.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleAgentStateChanged(event: AgentStateChanged): void {
  let id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.state = event.params.newState;
    agent.updatedAt = event.block.timestamp;
    agent.save();
  }
}

export function handleCreditRatingUpdated(event: CreditRatingUpdated): void {
  let id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.creditRating = event.params.rating;
    agent.updatedAt = event.block.timestamp;
    agent.save();
  }
}

export function handleCreditFactorsUpdated(event: CreditFactorsUpdated): void {
  let id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.updatedAt = event.block.timestamp;
    agent.save();
  }
}

export function handleSharpeUpdated(event: SharpeUpdated): void {
  let id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.sharpeRatio = event.params.sharpeRatio;
    agent.updatedAt = event.block.timestamp;
    agent.save();
  }
}

export function handleRevenueRecorded(event: RevenueRecorded): void {
  let id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.totalEarned = event.params.totalEarned;
    agent.updatedAt = event.block.timestamp;
    agent.save();
  }
}
