import {
  Wrapped,
  Unwrapped,
} from "../../generated/BondCollateralWrapper/BondCollateralWrapper";
import { CollateralWrap } from "../../generated/schema";

export function handleWrapped(event: Wrapped): void {
  let id = event.params.tokenId.toString();
  let wrap = new CollateralWrap(id);
  wrap.tokenId = event.params.tokenId;
  wrap.owner = event.params.owner;
  wrap.classId = event.params.classId;
  wrap.nonceId = event.params.nonceId;
  wrap.amount = event.params.amount;
  wrap.wrapped = true;
  wrap.save();
}

export function handleUnwrapped(event: Unwrapped): void {
  let id = event.params.tokenId.toString();
  let wrap = CollateralWrap.load(id);
  if (wrap) {
    wrap.wrapped = false;
    wrap.save();
  }
}
