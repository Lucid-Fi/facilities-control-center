"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ConfigManagerError,
  createConfigManagerService,
} from "@/lib/config-manager-service";
import type {
  CreateStagedLoanBookRequest,
  ProfileResponse,
  StagedLoanBookResponse,
  UpdateStagedLoanBookRequest,
} from "@/lib/types/config-manager";

/**
 * Hook to fetch all staged loan books
 *
 * @param incompleteOnly - If true, only return staged loan books where is_complete is false
 * @param bearerToken - Optional bearer token for authentication
 * @returns Query result containing array of staged loan books
 */
export function useStagedLoanBooks(
  incompleteOnly?: boolean,
  bearerToken?: string
) {
  return useQuery<StagedLoanBookResponse[], Error>({
    queryKey: ["staged-loan-books", incompleteOnly],
    queryFn: async () => {
      const service = createConfigManagerService(bearerToken);
      return service.listStagedLoanBooks(incompleteOnly);
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

/**
 * Hook to fetch a specific staged loan book by address
 *
 * @param address - Blockchain address of the loan book
 * @param bearerToken - Optional bearer token for authentication
 * @returns Query result containing the staged loan book
 */
export function useStagedLoanBook(address?: string, bearerToken?: string) {
  return useQuery<StagedLoanBookResponse, Error>({
    queryKey: ["staged-loan-book", address],
    queryFn: async () => {
      if (!address) {
        throw new Error("Address is required");
      }
      const service = createConfigManagerService(bearerToken);
      return service.getStagedLoanBook(address);
    },
    enabled: !!address,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

/**
 * Hook to fetch a profile by profile slug
 *
 * @param profileSlug - URL-friendly profile identifier
 * @param bearerToken - Bearer token for authentication (required)
 * @returns Query result containing the profile with associated loan books
 */
export function useProfile(profileSlug?: string, bearerToken: string = "") {
  return useQuery<ProfileResponse, Error>({
    queryKey: ["profile", profileSlug, bearerToken],
    queryFn: async () => {
      if (!profileSlug) {
        throw new Error("Profile slug is required");
      }
      if (!bearerToken) {
        throw new Error("Bearer token is required");
      }
      const service = createConfigManagerService(bearerToken);
      return service.getProfile(profileSlug, bearerToken);
    },
    enabled: !!profileSlug && !!bearerToken,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

/**
 * Hook to create a new staged loan book
 *
 * @param bearerToken - Optional bearer token for authentication
 * @returns Mutation object with mutate function and state
 */
export function useCreateStagedLoanBook(bearerToken?: string) {
  const queryClient = useQueryClient();

  return useMutation<
    StagedLoanBookResponse,
    Error,
    CreateStagedLoanBookRequest
  >({
    mutationFn: async (data: CreateStagedLoanBookRequest) => {
      const service = createConfigManagerService(bearerToken);
      return service.createStagedLoanBook(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged-loan-books"] });
      toast.success("Staged loan book created successfully");
    },
    onError: (error: Error) => {
      if (error instanceof ConfigManagerError) {
        toast.error(`Failed to create staged loan book: ${error.message}`);
      } else {
        toast.error("Failed to create staged loan book");
      }
    },
  });
}

/**
 * Hook to update an existing staged loan book
 *
 * @param bearerToken - Optional bearer token for authentication
 * @returns Mutation object with mutate function and state
 */
export function useUpdateStagedLoanBook(bearerToken?: string) {
  const queryClient = useQueryClient();

  return useMutation<
    StagedLoanBookResponse,
    Error,
    { address: string; data: UpdateStagedLoanBookRequest }
  >({
    mutationFn: async ({ address, data }) => {
      const service = createConfigManagerService(bearerToken);
      return service.updateStagedLoanBook(address, data);
    },
    onSuccess: (_, { address }) => {
      queryClient.invalidateQueries({ queryKey: ["staged-loan-books"] });
      queryClient.invalidateQueries({
        queryKey: ["staged-loan-book", address],
      });
      toast.success("Staged loan book updated successfully");
    },
    onError: (error: Error) => {
      if (error instanceof ConfigManagerError) {
        toast.error(`Failed to update staged loan book: ${error.message}`);
      } else {
        toast.error("Failed to update staged loan book");
      }
    },
  });
}

/**
 * Hook to delete a staged loan book
 *
 * @param bearerToken - Optional bearer token for authentication
 * @returns Mutation object with mutate function and state
 */
export function useDeleteStagedLoanBook(bearerToken?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (address: string) => {
      const service = createConfigManagerService(bearerToken);
      return service.deleteStagedLoanBook(address);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged-loan-books"] });
      toast.success("Staged loan book deleted successfully");
    },
    onError: (error: Error) => {
      if (error instanceof ConfigManagerError) {
        toast.error(`Failed to delete staged loan book: ${error.message}`);
      } else {
        toast.error("Failed to delete staged loan book");
      }
    },
  });
}

/**
 * Hook to promote a staged loan book to production
 *
 * @param bearerToken - Optional bearer token for authentication
 * @returns Mutation object with mutate function and state
 */
export function usePromoteStagedLoanBook(bearerToken?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (address: string) => {
      const service = createConfigManagerService(bearerToken);
      return service.promoteStagedLoanBook(address);
    },
    onSuccess: (_, address) => {
      queryClient.invalidateQueries({ queryKey: ["staged-loan-books"] });
      queryClient.invalidateQueries({
        queryKey: ["staged-loan-book", address],
      });
      toast.success("Staged loan book promoted successfully");
    },
    onError: (error: Error) => {
      if (error instanceof ConfigManagerError) {
        toast.error(`Failed to promote staged loan book: ${error.message}`);
      } else {
        toast.error("Failed to promote staged loan book");
      }
    },
  });
}
