// Simple toast hook - placeholder for actual toast implementation
export function useToast() {
  return {
    toast: ({ title, description, variant }: {
      title?: string;
      description?: string;
      variant?: "default" | "destructive";
    }) => {
      const prefix = variant === "destructive" ? "ERROR:" : "INFO:";
      console.log(`${prefix} ${title ?? ""} - ${description ?? ""}`);
    },
  };
}
