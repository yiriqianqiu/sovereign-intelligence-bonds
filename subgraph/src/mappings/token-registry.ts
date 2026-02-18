import { BigInt } from "@graphprotocol/graph-ts";
import {
  TokenAdded,
  TokenRemoved,
  TokenPriceUpdated,
} from "../../generated/TokenRegistry/TokenRegistry";
import { TokenInfo } from "../../generated/schema";

export function handleTokenAdded(event: TokenAdded): void {
  let id = event.params.token.toHexString();
  let token = new TokenInfo(id);
  token.address = event.params.token;
  token.symbol = event.params.symbol;
  token.priceUsd = BigInt.fromI32(0);
  token.active = true;
  token.addedAt = event.block.timestamp;
  token.save();
}

export function handleTokenRemoved(event: TokenRemoved): void {
  let id = event.params.token.toHexString();
  let token = TokenInfo.load(id);
  if (token) {
    token.active = false;
    token.save();
  }
}

export function handleTokenPriceUpdated(event: TokenPriceUpdated): void {
  let id = event.params.token.toHexString();
  let token = TokenInfo.load(id);
  if (token) {
    token.priceUsd = event.params.newPrice;
    token.save();
  }
}
