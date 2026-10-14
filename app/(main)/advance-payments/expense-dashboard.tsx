// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import ExpenseDashboardScreen from "@/src/features/advancePayments/screens/ExpenseDashboardScreen";

/**
 * The Payments & Expenses board, reached from the Reports tab.
 *
 * ITS OWN KEY. `Expense_Dashboard` is read-only and says nothing about
 * raising or approving a payment, so none of the other advance-payment keys
 * open it and holding it opens nothing else. The server checks the same key
 * on both endpoints this screen reads.
 */
export default function ExpenseDashboardRoute() {
  return (
    <ScreenGuard screen="advance-payments/expense-dashboard">
      <ExpenseDashboardScreen />
    </ScreenGuard>
  );
}
