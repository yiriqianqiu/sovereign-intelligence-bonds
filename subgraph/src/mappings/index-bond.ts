import { BigInt } from "@graphprotocol/graph-ts";
import {
  IndexCreated,
  IndexMinted,
  IndexRedeemed,
  IndexRebalanced,
} from "../../generated/IndexBond/IndexBond";
import { IndexBondEntity } from "../../generated/schema";

export function handleIndexCreated(event: IndexCreated): void {
  let id = event.params.indexId.toString();
  let index = new IndexBondEntity(id);
  index.indexId = event.params.indexId;
  index.name = event.params.name;
  index.componentCount = event.params.componentCount;
  index.active = true;
  index.createdAt = event.block.timestamp;
  index.save();
}

export function handleIndexMinted(event: IndexMinted): void {
  // Mint events are tracked for analytics
}

export function handleIndexRedeemed(event: IndexRedeemed): void {
  // Redeem events are tracked for analytics
}

export function handleIndexRebalanced(event: IndexRebalanced): void {
  let id = event.params.indexId.toString();
  let index = IndexBondEntity.load(id);
  if (index) {
    index.save();
  }
}
