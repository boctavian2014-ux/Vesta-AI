import React from "react";
import { StripeProvider } from "@stripe/stripe-react-native";

export default function StripeRoot({ children, publishableKey }) {
  return <StripeProvider publishableKey={publishableKey}>{children}</StripeProvider>;
}
