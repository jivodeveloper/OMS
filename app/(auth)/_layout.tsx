import { COLORS } from "@/src/constants/theme";
import { Stack } from "expo-router";

export default function AuthLayout() {
    return (
        <Stack screenOptions={{headerShown:false,contentStyle: { backgroundColor: COLORS.background },}}/>
    );
}