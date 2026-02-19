import {
  PaymentReceived,
} from "../../generated/B402PaymentReceiver/B402PaymentReceiver";
import { B402Payment } from "../../generated/schema";

export function handlePaymentReceived(event: PaymentReceived): void {
  let id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let payment = new B402Payment(id);
  payment.payer = event.params.payer;
  payment.agentId = event.params.agentId;
  payment.token = event.params.token;
  payment.endpoint = event.params.endpoint;
  payment.amount = event.params.amount;
  payment.timestamp = event.block.timestamp;
  payment.save();
}
