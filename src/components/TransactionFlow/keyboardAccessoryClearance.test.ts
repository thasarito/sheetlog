import { describe, expect, it } from "vitest";
import {
  IOS_INPUT_ASSISTANT_CLEARANCE_PX,
  keyboardAccessoryOffset,
  type NavigatorPlatformLike,
} from "./keyboardAccessoryClearance";

function platform(
  overrides: Partial<NavigatorPlatformLike>,
): NavigatorPlatformLike {
  return {
    maxTouchPoints: 0,
    platform: "",
    userAgent: "",
    ...overrides,
  };
}

describe("keyboard accessory clearance", () => {
  it("raises active iPhone and iPod accessories above the input assistant", () => {
    expect(
      keyboardAccessoryOffset(
        true,
        platform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" }),
      ),
    ).toBe(-IOS_INPUT_ASSISTANT_CLEARANCE_PX);
    expect(
      keyboardAccessoryOffset(
        true,
        platform({ userAgent: "Mozilla/5.0 (iPod touch; CPU iPhone OS 18_0)" }),
      ),
    ).toBe(-IOS_INPUT_ASSISTANT_CLEARANCE_PX);
  });

  it("recognizes iPadOS when it presents a desktop Mac platform", () => {
    expect(
      keyboardAccessoryOffset(
        true,
        platform({
          maxTouchPoints: 5,
          platform: "MacIntel",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        }),
      ),
    ).toBe(-IOS_INPUT_ASSISTANT_CLEARANCE_PX);
  });

  it("keeps the normal offset outside active iOS keyboard state", () => {
    const iPhone = platform({
      maxTouchPoints: 5,
      platform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)",
    });
    const android = platform({
      maxTouchPoints: 5,
      platform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro)",
    });
    const desktopMac = platform({
      maxTouchPoints: 0,
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)",
    });

    expect(keyboardAccessoryOffset(false, iPhone)).toBe(0);
    expect(keyboardAccessoryOffset(true, android)).toBe(0);
    expect(keyboardAccessoryOffset(true, desktopMac)).toBe(0);
  });
});
