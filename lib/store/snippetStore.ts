"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export interface Snippet {
  id: string;
  name: string;
  command: string;
}

interface SnippetState {
  snippets: Snippet[];
  addSnippet: (name: string, command: string) => void;
  updateSnippet: (id: string, name: string, command: string) => void;
  deleteSnippet: (id: string) => void;
}

export const useSnippetStore = create<SnippetState>()(
  persist(
    (set) => ({
      snippets: [],
      addSnippet: (name, command) =>
        set((state) => ({
          snippets: [...state.snippets, { id: uuidv4(), name, command }],
        })),
      updateSnippet: (id, name, command) =>
        set((state) => ({
          snippets: state.snippets.map((s) =>
            s.id === id ? { ...s, name, command } : s
          ),
        })),
      deleteSnippet: (id) =>
        set((state) => ({
          snippets: state.snippets.filter((s) => s.id !== id),
        })),
    }),
    {
      name: "wterm-snippets",
    }
  )
);
