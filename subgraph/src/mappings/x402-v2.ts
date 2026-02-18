import {
  PaymentReceived,
} from "../../generated/X402PaymentReceiverV2/X402PaymentReceiverV2";
import { X402Payment } from "../../generated/schema";

export function handlePaymentReceived(event: PaymentReceived): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let payment = new X402Payment(id);
  payment.payer = event.params.payer;
  payment.agentId = event.params.agentId;
  payment.token = event.params.token;
  payment.endpoint = event.params.endpoint;
  payment.amount = event.params.amount;
  payment.timestamp = event.block.timestamp;
  payment.save();
}
