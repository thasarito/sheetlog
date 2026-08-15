export type FlowGenerationToken = Readonly<{
  generation: number;
  key: string;
}>;

export type FlowGeneration = {
  capture: () => FlowGenerationToken;
  isCurrent: (token: FlowGenerationToken, expectedKey?: string) => boolean;
  transition: (key: string) => FlowGenerationToken;
};

export function createFlowGeneration(initialKey: string): FlowGeneration {
  let generation = 0;
  let key = initialKey;

  return {
    capture: () => ({ generation, key }),
    isCurrent: (token, expectedKey = token.key) =>
      token.generation === generation &&
      token.key === expectedKey &&
      key === expectedKey,
    transition: (nextKey) => {
      generation += 1;
      key = nextKey;
      return { generation, key };
    },
  };
}
