import { BigInt } from "@graphprotocol/graph-ts";
import {
  ProposalCreated,
  Voted,
  ProposalExecuted,
  ProposalCancelled,
} from "../../generated/BondholderGovernor/BondholderGovernor";
import { GovernanceProposal, Vote } from "../../generated/schema";

export function handleProposalCreated(event: ProposalCreated): void {
  let id = event.params.proposalId.toString();
  let proposal = new GovernanceProposal(id);
  proposal.proposalId = event.params.proposalId;
  proposal.classId = event.params.classId;
  proposal.proposalType = event.params.proposalType;
  proposal.newValue = event.params.newValue;
  proposal.proposer = event.params.proposer;
  proposal.forVotes = BigInt.fromI32(0);
  proposal.againstVotes = BigInt.fromI32(0);
  proposal.state = "Active";
  proposal.createdAt = event.block.timestamp;
  proposal.save();
}

export function handleVoted(event: Voted): void {
  let voteId = event.params.proposalId.toString() + "-" + event.params.voter.toHexString();
  let vote = new Vote(voteId);
  vote.proposal = event.params.proposalId.toString();
  vote.voter = event.params.voter;
  vote.support = event.params.support;
  vote.weight = event.params.weight;
  vote.timestamp = event.block.timestamp;
  vote.save();

  let proposal = GovernanceProposal.load(event.params.proposalId.toString());
  if (proposal) {
    if (event.params.support) {
      proposal.forVotes = proposal.forVotes.plus(event.params.weight);
    } else {
      proposal.againstVotes = proposal.againstVotes.plus(event.params.weight);
    }
    proposal.save();
  }
}

export function handleProposalExecuted(event: ProposalExecuted): void {
  let id = event.params.proposalId.toString();
  let proposal = GovernanceProposal.load(id);
  if (proposal) {
    proposal.state = "Executed";
    proposal.save();
  }
}

export function handleProposalCancelled(event: ProposalCancelled): void {
  let id = event.params.proposalId.toString();
  let proposal = GovernanceProposal.load(id);
  if (proposal) {
    proposal.state = "Cancelled";
    proposal.save();
  }
}
