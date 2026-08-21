type NavigatorProperty = "userAgent" | "platform" | "maxTouchPoints";

const IOS_18_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export function mockIosHapticsPlatform(): () => void {
  const properties: NavigatorProperty[] = [
    "userAgent",
    "platform",
    "maxTouchPoints",
  ];
  const descriptors = new Map(
    properties.map((property) => [
      property,
      Object.getOwnPropertyDescriptor(window.navigator, property),
    ]),
  );

  Object.defineProperties(window.navigator, {
    userAgent: {
      configurable: true,
      get: () => IOS_18_USER_AGENT,
    },
    platform: {
      configurable: true,
      get: () => "iPhone",
    },
    maxTouchPoints: {
      configurable: true,
      get: () => 5,
    },
  });

  return () => {
    for (const property of properties) {
      const descriptor = descriptors.get(property);
      if (descriptor) {
        Object.defineProperty(window.navigator, property, descriptor);
      } else {
        delete (window.navigator as Navigator &
          Partial<Record<NavigatorProperty, unknown>>)[property];
      }
    }
  };
}
