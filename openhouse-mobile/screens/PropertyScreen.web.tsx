import PropertyScreenInner from "./PropertyScreenInner";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CatastroProperty, PropertyScreenParams } from "./PropertyScreenInner";

export type { CatastroProperty, PropertyScreenParams };

type Props = NativeStackScreenProps<PropertyScreenParams, "Property">;

export default function PropertyScreen(props: Props) {
  return <PropertyScreenInner {...props} stripe={null} />;
}
