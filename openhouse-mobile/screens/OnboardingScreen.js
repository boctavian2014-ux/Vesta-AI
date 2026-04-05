import React, { useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

const { width, height } = Dimensions.get("window");

export const ONBOARDING_STORAGE_KEY = "@vesta_onboarding_seen";

const slides = [
  {
    id: "1",
    emoji: "🔍",
    title: "onb1_title",
    sub: "onb1_sub",
    bg: "#1e3a8a",
  },
  {
    id: "2",
    emoji: "📄",
    title: "onb2_title",
    sub: "onb2_sub",
    bg: "#0f172a",
  },
  {
    id: "3",
    emoji: "📈",
    title: "onb3_title",
    sub: "onb3_sub",
    bg: "#111827",
  },
];

export default function OnboardingScreen({ onFinish }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      onFinish?.();
    }
  };

  const isLast = currentIndex === slides.length - 1;
  const footerBottom = Math.max(40, insets.bottom + 20);

  const getItemLayout = (_, index) => ({
    length: width,
    offset: width * index,
    index,
  });

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={(e) =>
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <View style={[styles.slide, { backgroundColor: item.bg }]}>
            <View style={styles.emojiContainer}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.title}>{t(item.title)}</Text>
            <Text style={styles.sub}>{t(item.sub)}</Text>
          </View>
        )}
        keyExtractor={(item) => item.id}
      />

      {/* Dots de paginare */}
      <View style={[styles.dotsRow, { bottom: footerBottom + 80 }]}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Footer: Skip + Next/CTA */}
      <View style={[styles.footer, { bottom: footerBottom }]}>
        <TouchableOpacity
          onPress={onFinish}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.skipText}>{t("onb_skip")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.nextButton, isLast && styles.ctaButton]} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.buttonText}>
            {isLast ? t("onb_cta") : t("onb_next")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    width,
    height,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingBottom: 160,
  },
  emojiContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  emoji: {
    fontSize: 80,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
  },
  sub: {
    fontSize: 16,
    color: "#cbd5e1",
    textAlign: "center",
    lineHeight: 26,
  },
  dotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: {
    width: 24,
    backgroundColor: "#fff",
  },
  footer: {
    position: "absolute",
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skipText: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "600",
  },
  nextButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    minWidth: 140,
    alignItems: "center",
  },
  ctaButton: {
    backgroundColor: "#c6a227",
    paddingHorizontal: 24,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
