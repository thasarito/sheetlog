"use client";

import React from "react";
import { CategoryGrid } from "../CategoryGrid";
import { TagChips } from "../TagChips";
import { TAGS } from "./constants";

type StepCategoryProps = {
  frequent: string[];
  others: string[];
  selected: string | null;
  tags: string[];
  onBack: () => void;
  onSelectCategory: (value: string) => void;
  onToggleTag: (value: string) => void;
};

export function StepCategory({
  frequent,
  others,
  selected,
  tags,
  onBack,
  onSelectCategory,
  onToggleTag,
}: StepCategoryProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Choose a category</h2>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={onBack}
        >
          Back
        </button>
      </div>
      <CategoryGrid
        frequent={frequent}
        others={others}
        selected={selected}
        onSelect={onSelectCategory}
      />
      <div className="pt-2">
        <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">
          Tags
        </p>
        <TagChips tags={TAGS} selected={tags} onToggle={onToggleTag} />
      </div>
    </>
  );
}
