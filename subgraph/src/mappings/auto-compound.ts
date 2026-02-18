import { BigInt } from "@graphprotocol/graph-ts";
import {
  Deposited,
  Withdrawn,
  Compounded,
} from "../../generated/AutoCompoundVault/AutoCompoundVault";
import { AutoCompoundEvent } from "../../generated/schema";

export function handleDeposited(event: Deposited): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let evt = new AutoCompoundEvent(id);
  evt.type = "Deposit";
  evt.user = event.params.user;
  evt.classId = event.params.classId;
  evt.nonceId = event.params.nonceId;
  evt.amount = event.params.amount;
  evt.timestamp = event.block.timestamp;
  evt.save();
}

export function handleWithdrawn(event: Withdrawn): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let evt = new AutoCompoundEvent(id);
  evt.type = "Withdrawal";
  evt.user = event.params.user;
  evt.classId = event.params.classId;
  evt.nonceId = event.params.nonceId;
  evt.amount = event.params.amount;
  evt.timestamp = event.block.timestamp;
  evt.save();
}

export function handleCompounded(event: Compounded): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let evt = new AutoCompoundEvent(id);
  evt.type = "Compound";
  evt.user = null;
  evt.classId = event.params.classId;
  evt.nonceId = event.params.nonceId;
  evt.amount = event.params.bondsPurchased;
  evt.timestamp = event.block.timestamp;
  evt.save();
}
