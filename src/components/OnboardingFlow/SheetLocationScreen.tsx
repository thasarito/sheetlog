import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, ChevronRight, Check, ArrowLeft } from "lucide-react";
import { OnboardingLayout } from "./OnboardingLayout";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "../ui/drawer";
import { Skeleton } from "../ui/skeleton";
import { useAuthStorage } from "../providers";
import { listFolders } from "../../lib/google";
import type { LocationMode, ScreenMeta } from "./types";
import { cn } from "../../lib/utils";

type SheetLocationScreenProps = {
  meta: ScreenMeta;
  locationMode: LocationMode;
  folderIdInput: string;
  isSettingUpSheet: boolean;
  onLocationModeChange: (mode: LocationMode) => void;
  onFolderIdChange: (value: string) => void;
  onSubmit: () => void;
};

export function SheetLocationScreen({
  meta,
  locationMode,
  folderIdInput,
  isSettingUpSheet,
  onLocationModeChange,
  onFolderIdChange,
  onSubmit,
}: SheetLocationScreenProps) {
  const { accessToken } = useAuthStorage();
  const [isOpen, setIsOpen] = useState(false);
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >([{ id: "root", name: "My Drive" }]);
  const currentFolder = folderStack[folderStack.length - 1];

  const [selectedFolder, setSelectedFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data: folders = [], isLoading } = useQuery({
    queryKey: ["folders", accessToken, currentFolder.id],
    queryFn: async () => {
      if (!accessToken) {
        return [];
      }
      try {
        return await listFolders(accessToken, currentFolder.id);
      } catch (error) {
        console.error("Failed to list folders", error);
        return [];
      }
    },
    enabled: Boolean(accessToken) && isOpen,
  });

  function handleFolderClick(folder: { id: string; name: string }) {
    setFolderStack((prev) => [...prev, folder]);
  }

  function handleSelectFolder(folder: { id: string; name: string }) {
    setSelectedFolder(folder);
    onFolderIdChange(folder.id);
    onLocationModeChange("folder");
    setIsOpen(false);
  }

  function handleBack() {
    setFolderStack((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
  }

  return (
    <OnboardingLayout
      title="Where to save?"
      subtitle="Choose where your SheetLog_DB will be stored."
      stepCurrent={meta.stepNumber}
      stepTotal={meta.totalSteps}
    >
      <div className="space-y-4 pt-4 flex-1 w-full">
        <label
          className={cn(
            "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
            locationMode === "root"
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border bg-card hover:border-primary/50"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-full">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold">My Drive</div>
              <div className="text-xs text-muted-foreground">
                Store in main folder
              </div>
            </div>
          </div>
          <div className="relative flex items-center">
            <input
              type="radio"
              name="location"
              checked={locationMode === "root"}
              onChange={() => onLocationModeChange("root")}
              className="peer sr-only"
            />
            {locationMode === "root" && (
              <Check className="w-5 h-5 text-primary" />
            )}
          </div>
        </label>

        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerTrigger asChild>
            <div
              className={cn(
                "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
                locationMode === "folder"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border bg-card hover:border-primary/50"
              )}
              onClick={() => {
                onLocationModeChange("folder");
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onLocationModeChange("folder");
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 text-orange-600 rounded-full">
                  <Folder className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">Specific Folder</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selectedFolder
                      ? selectedFolder.name
                      : folderIdInput
                      ? "Folder Selected"
                      : "Choose a folder"}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Select Folder</DrawerTitle>
              <DrawerDescription>
                {currentFolder.id === "root"
                  ? "Browse your Google Drive"
                  : currentFolder.name}
              </DrawerDescription>
            </DrawerHeader>
            <div className="p-4 h-[60vh] overflow-y-auto">
              {folderStack.length > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-2 mb-4 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to{" "}
                  {folderStack[folderStack.length - 2]?.name ?? "Drive"}
                </button>
              )}
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={`folder-skeleton-${index}`}
                      className="flex items-center justify-between rounded-xl p-3"
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <Skeleton className="h-5 w-5 rounded-full" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                      <Skeleton className="h-8 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-xl group"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-3 flex-1 text-left"
                        onClick={() => handleFolderClick(folder)}
                      >
                        <Folder className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                        <span className="text-sm font-medium">
                          {folder.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFolder(folder);
                        }}
                        className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-colors"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                  {folders.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No folders found
                    </div>
                  )}
                </div>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          className="w-full rounded-2xl bg-primary py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-blue-200 transition hover:bg-primary/90 disabled:opacity-60"
          onClick={onSubmit}
          disabled={
            isSettingUpSheet ||
            (locationMode === "folder" && !folderIdInput.trim())
          }
        >
          {isSettingUpSheet ? "Setting up..." : "Continue"}
        </button>
      </div>
    </OnboardingLayout>
  );
}
