// Route shell only. The feature lives in src/features/approval so its
// components/hooks/data aren't picked up by Expo Router as navigable routes —
// every .tsx under app/ becomes a URL.
export { default } from "@/src/features/approval/screens/ApprovalListScreen";
