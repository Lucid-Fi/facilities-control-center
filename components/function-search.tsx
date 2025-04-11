import { useState, useMemo, useEffect } from "react";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ContractFunction } from "@/lib/contract-functions";

interface FunctionSearchProps {
  functions: ContractFunction[];
  onFilteredFunctionsChange: (functions: ContractFunction[]) => void;
}

export function FunctionSearch({
  functions,
  onFilteredFunctionsChange,
}: FunctionSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    functions.forEach((func) => {
      func.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [functions]);

  const filteredFunctions = useMemo(() => {
    return functions.filter((func) => {
      const matchesSearch =
        searchQuery === "" ||
        func.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        func.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        func.moduleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        func.functionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        func.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        );

      const matchesTags =
        selectedTags.size === 0 ||
        func.tags.some((tag) => selectedTags.has(tag));

      return matchesSearch && matchesTags;
    });
  }, [functions, searchQuery, selectedTags]);

  const toggleTag = (tag: string) => {
    const newTags = new Set(selectedTags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    setSelectedTags(newTags);
  };

  useEffect(() => {
    onFilteredFunctionsChange(filteredFunctions);
  }, [filteredFunctions, onFilteredFunctionsChange]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search functions by name, module, description, or tags..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full"
      />
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => (
          <Badge
            key={tag}
            variant={selectedTags.has(tag) ? "default" : "outline"}
            className="cursor-pointer hover:bg-primary/80"
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}
