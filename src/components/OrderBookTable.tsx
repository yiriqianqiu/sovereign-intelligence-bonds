"use client";

import { useOrders, type Order } from "@/hooks/useBondDEX";

interface OrderBookTableProps {
  classId: number;
  nonceId: number;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatExpiry(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return "Expired";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function OrderBookTable({ classId, nonceId }: OrderBookTableProps) {
  const { data: orders, isLoading } = useOrders(20);

  const filtered = orders.filter(
    (o) => o.classId === classId && o.nonceId === nonceId && o.active,
  );

  const sellOrders = filtered
    .filter((o) => o.isSell)
    .sort((a, b) => parseFloat(a.pricePerBond) - parseFloat(b.pricePerBond));

  const buyOrders = filtered
    .filter((o) => !o.isSell)
    .sort((a, b) => parseFloat(b.pricePerBond) - parseFloat(a.pricePerBond));

  if (isLoading) {
    return (
      <div className="card-glass rounded p-6">
        <p className="text-sm text-[rgb(var(--muted-foreground))]">Loading order book...</p>
      </div>
    );
  }

  return (
    <div className="card-glass rounded p-6">
      <h3 className="mb-4 text-base font-semibold">
        Order Book
        <span className="ml-2 text-xs text-[rgb(var(--muted-foreground))]">
          Class #{classId} / Nonce #{nonceId}
        </span>
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {/* Sell Orders */}
        <div>
          <h4 className="mb-2 text-xs font-medium text-crimson">Sell Orders</h4>
          <OrderTable orders={sellOrders} isSell />
        </div>
        {/* Buy Orders */}
        <div>
          <h4 className="mb-2 text-xs font-medium text-sage">Buy Orders</h4>
          <OrderTable orders={buyOrders} isSell={false} />
        </div>
      </div>
      {filtered.length === 0 && (
        <p className="mt-4 text-center text-sm text-[rgb(var(--muted-foreground))]">
          No active orders for this bond class.
        </p>
      )}
    </div>
  );
}

function OrderTable({ orders, isSell }: { orders: Order[]; isSell: boolean }) {
  if (orders.length === 0) {
    return (
      <p className="text-xs text-[rgb(var(--muted-foreground))]">No orders</p>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[rgb(var(--border))]">
          <th className="pb-1.5 text-left font-medium text-[rgb(var(--muted-foreground))]">Price</th>
          <th className="pb-1.5 text-right font-medium text-[rgb(var(--muted-foreground))]">Amt</th>
          <th className="pb-1.5 text-right font-medium text-[rgb(var(--muted-foreground))]">Total</th>
          <th className="hidden pb-1.5 text-right font-medium text-[rgb(var(--muted-foreground))] sm:table-cell">Maker</th>
          <th className="pb-1.5 text-right font-medium text-[rgb(var(--muted-foreground))]">Exp</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => {
          const price = parseFloat(order.pricePerBond);
          const total = price * order.amount;
          return (
            <tr key={order.orderId} className="border-b border-[rgb(var(--border))]/30">
              <td className={`py-1.5 font-mono ${isSell ? "text-crimson" : "text-sage"}`}>
                {price.toFixed(4)}
              </td>
              <td className="py-1.5 text-right font-mono">{order.amount}</td>
              <td className="py-1.5 text-right font-mono">{total.toFixed(4)}</td>
              <td className="hidden py-1.5 text-right font-mono text-[rgb(var(--muted-foreground))] sm:table-cell">
                {truncateAddress(order.maker)}
              </td>
              <td className="py-1.5 text-right font-mono text-[rgb(var(--muted-foreground))]">
                {formatExpiry(order.expiry)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
