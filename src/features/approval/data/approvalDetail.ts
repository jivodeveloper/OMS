import type { ApprovalDetail } from "../types";

/**
 * Dummy detail payload. UI-only — replaced by the approvals API later, so the
 * shape stays close to what an endpoint would plausibly return.
 */
export const approvalDetail: ApprovalDetail = {
  requestNo: "APR-2026-0780",
  status: "Pending",
  party: "Shree Ram Enterprises",
  company: "Jivo Wellness Pvt. Ltd.",
  createdBy: "Pankaj Sharma",
  createdDate: "28 Jul 2026",
  createdTime: "09:10 AM",
  invoice: "INV-2026-0782",
  paymentType: "Mixed (Cash + Cheque)",
  amount: 125000,
  remarks: "Payment for invoice against PO #PO-2026-045.",

  payments: [
    {
      id: "1",
      type: "Cash",
      amount: 80000,
      noteRows: [
        { denomination: 500, quantity: 100 },
        { denomination: 200, quantity: 100 },
        { denomination: 100, quantity: 100 },
      ],
      remarks: "Collected at the Ambala branch counter.",
    },
    {
      id: "2",
      type: "UPI",
      amount: 20000,
      upiReference: "UPI2026072812345678",
      attachment: {
        name: "UPI_Screenshot.png",
        size: "412 KB",
        kind: "image",
      },
    },
    {
      id: "3",
      type: "Cheque",
      amount: 25000,
      chequeNumber: "028206",
      bankName: "HDFC Bank",
      chequeDate: "30 Jul 2026",
      attachment: {
        name: "Cheque_28206.jpg",
        size: "1.2 MB",
        kind: "image",
      },
    },
  ],

  attachments: [
    { id: "a1", name: "Cheque_28206.jpg", size: "1.2 MB", kind: "image" },
    {
      id: "a2",
      name: "Invoice_INV-2026-0782.pdf",
      size: "348 KB",
      kind: "pdf",
    },
    { id: "a3", name: "Payment_Receipt.pdf", size: "196 KB", kind: "pdf" },
  ],
};
