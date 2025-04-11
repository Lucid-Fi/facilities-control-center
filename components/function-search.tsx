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
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set()
  );
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    functions.forEach((func) => {
      func.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [functions]);

  const allModules = useMemo(() => {
    const moduleSet = new Set<string>();
    functions.forEach((func) => moduleSet.add(func.moduleName));
    return Array.from(moduleSet).sort();
  }, [functions]);

  const allActors = useMemo(() => {
    const actorSet = new Set<string>();
    functions.forEach((func) => {
      if (func.actor) {
        actorSet.add(func.actor);
      }
    });
    return Array.from(actorSet).sort();
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

      const matchesModules =
        selectedModules.size === 0 || selectedModules.has(func.moduleName);

      const matchesActors =
        selectedActors.size === 0 ||
        (func.actor && selectedActors.has(func.actor));

      return matchesSearch && matchesTags && matchesModules && matchesActors;
    });
  }, [functions, searchQuery, selectedTags, selectedModules, selectedActors]);

  const toggleTag = (tag: string) => {
    const newTags = new Set(selectedTags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    setSelectedTags(newTags);
  };

  const toggleModule = (module: string) => {
    const newModules = new Set(selectedModules);
    if (newModules.has(module)) {
      newModules.delete(module);
    } else {
      newModules.add(module);
    }
    setSelectedModules(newModules);
  };

  const toggleActor = (actor: string) => {
    const newActors = new Set(selectedActors);
    if (newActors.has(actor)) {
      newActors.delete(actor);
    } else {
      newActors.add(actor);
    }
    setSelectedActors(newActors);
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
        <span className="text-sm font-medium text-muted-foreground mr-2 self-center">
          Actors:
        </span>
        {allActors.map((actor) => (
          <Badge
            key={`actor-${actor}`}
            variant={selectedActors.has(actor) ? "destructive" : "outline"}
            className="cursor-pointer hover:bg-destructive/80 text-md px-3 py-1 rounded-md"
            onClick={() => toggleActor(actor)}
          >
            {actor}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-sm font-medium text-muted-foreground mr-2 self-center">
          Modules:
        </span>
        {allModules.map((module) => (
          <Badge
            key={`module-${module}`}
            variant={selectedModules.has(module) ? "default" : "outline"}
            className="cursor-pointer hover:bg-primary/50 text-lg px-4 py-1 rounded-lg"
            onClick={() => toggleModule(module)}
          >
            {module}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-sm font-medium text-muted-foreground mr-2 self-center">
          Tags:
        </span>
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
