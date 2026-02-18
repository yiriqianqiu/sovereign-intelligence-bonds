"use client";

import { useState } from "react";
import { useOrders, useOrderCount, useProtocolFee, type Order } from "@/hooks/useBondDEX";
import { OrderBookTable } from "@/components/OrderBookTable";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatExpiry(timestamp: number): string {
  if (timestamp === 0) return "--";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatExpiryShort(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return "Expired";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

type FilterTab = "all" | "sell" | "buy";

export default function MarketPage() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedNonceId, setSelectedNonceId] = useState<number | null>(null);

  const { data: orderCount, isLoading: countLoading } = useOrderCount();
  const { data: protocolFee, isLoading: feeLoading } = useProtocolFee();
  const { data: orders, isLoading: ordersLoading } = useOrders(50);

  const activeOrders = orders.filter((o) => o.active);
  const filteredOrders =
    filter === "all"
      ? orders
      : filter === "sell"
        ? orders.filter((o) => o.isSell)
        : orders.filter((o) => !o.isSell);

  const handleRowClick = (order: Order) => {
    if (selectedClassId === order.classId && selectedNonceId === order.nonceId) {
      setSelectedClassId(null);
      setSelectedNonceId(null);
    } else {
      setSelectedClassId(order.classId);
      setSelectedNonceId(order.nonceId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Bond Market</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
          Secondary market for ERC-3475 bond trading
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Orders</p>
          <p className="stat-value font-mono text-2xl text-gold">
            {countLoading ? "..." : (orderCount ?? 0)}
          </p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Active Orders</p>
          <p className="stat-value font-mono text-2xl text-sage">
            {ordersLoading ? "..." : activeOrders.length}
          </p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Protocol Fee</p>
          <p className="stat-value font-mono text-2xl">
            {feeLoading ? "..." : `${protocolFee ?? 0} bps`}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "sell", "buy"] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === tab
                ? "bg-[#D4A853]/15 text-gold"
                : "bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--border))]"
            }`}
          >
            {tab === "all" ? "All" : tab === "sell" ? "Sell Orders" : "Buy Orders"}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      {ordersLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <p className="text-[rgb(var(--muted-foreground))]">Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-12 text-center text-sm text-[rgb(var(--muted-foreground))]">
          No orders found.
        </div>
      ) : (
        <div className="card-glass overflow-x-auto rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))]">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                  Order ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                  Class
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                  Nonce
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                  Price (BNB)
                </th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))] md:table-cell">
                  Maker
                </th>
                <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))] sm:table-cell">
                  Expiry
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const isSelected =
                  selectedClassId === order.classId && selectedNonceId === order.nonceId;
                const isExpired = order.expiry > 0 && order.expiry < Math.floor(Date.now() / 1000);

                return (
                  <tr
                    key={order.orderId}
                    onClick={() => handleRowClick(order)}
                    className={`cursor-pointer border-b border-[rgb(var(--border))]/30 transition-colors duration-200 last:border-0 hover:bg-[rgb(var(--secondary))]/30 ${
                      isSelected ? "bg-[rgb(var(--secondary))]/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs">#{order.orderId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          order.isSell
                            ? "bg-[#B94137]/10 text-crimson"
                            : "bg-[#5A8A6E]/10 text-sage"
                        }`}
                      >
                        {order.isSell ? "Sell" : "Buy"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">#{order.classId}</td>
                    <td className="px-4 py-3 font-mono text-xs">#{order.nonceId}</td>
                    <td className="px-4 py-3 text-right font-mono">{order.amount}</td>
                    <td className="px-4 py-3 text-right font-mono text-gold">
                      {parseFloat(order.pricePerBond).toFixed(4)}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono text-xs text-[rgb(var(--muted-foreground))] md:table-cell">
                      {truncateAddress(order.maker)}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-xs text-[rgb(var(--muted-foreground))] sm:table-cell">
                      <span title={formatExpiry(order.expiry)}>
                        {formatExpiryShort(order.expiry)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          order.active && !isExpired
                            ? "bg-[#5A8A6E]/10 text-sage"
                            : isExpired
                              ? "bg-[#B94137]/10 text-crimson"
                              : "bg-[rgb(var(--muted-foreground))]/10 text-[rgb(var(--muted-foreground))]"
                        }`}
                      >
                        {order.active && !isExpired ? "Active" : isExpired ? "Expired" : "Filled"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Order Book for Selected Class/Nonce */}
      {selectedClassId !== null && selectedNonceId !== null && (
        <div className="mt-6">
          <OrderBookTable classId={selectedClassId} nonceId={selectedNonceId} />
        </div>
      )}
    </div>
  );
}
