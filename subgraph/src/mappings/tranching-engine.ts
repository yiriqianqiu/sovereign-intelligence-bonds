import {
  TrancheGroupCreated,
} from "../../generated/TranchingEngine/TranchingEngine";
import { TrancheGroup } from "../../generated/schema";

export function handleTrancheGroupCreated(event: TrancheGroupCreated): void {
  let id = event.params.groupId.toString();
  let group = new TrancheGroup(id);
  group.groupId = event.params.groupId;
  group.agentId = event.params.agentId;
  group.seniorClassId = event.params.seniorClassId;
  group.juniorClassId = event.params.juniorClassId;
  group.save();
}
