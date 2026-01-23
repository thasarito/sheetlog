import { createContext, useContext } from 'react';

type IphoneFrameContextValue = {
  scale: number;
  isInsideFrame: boolean;
};

const IphoneFrameContext = createContext<IphoneFrameContextValue>({
  scale: 1,
  isInsideFrame: false,
});

export const IphoneFrameProvider = IphoneFrameContext.Provider;

export function useIphoneFrameScale() {
  return useContext(IphoneFrameContext);
}
