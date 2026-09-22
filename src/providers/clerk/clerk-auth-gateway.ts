import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

import type { AuthGateway } from "@/application/contracts";

export class ClerkAuthGateway implements AuthGateway {
  async getActor() {
    const { userId } = await auth();
    if (!userId) return { clerkUserId: null, email: null };

    const user = await currentUser();
    return {
      clerkUserId: userId,
      email: user?.primaryEmailAddress?.emailAddress ?? null,
    };
  }
}
