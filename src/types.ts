export interface Statement {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  submitterName?: string;
  revocations?: string[];
}

export interface Debate {
  id: string;
  title: string;
  createdAt: number;
  status: "Ouvert" | "Résolu";
  conclusion: string;
  ownerId: string;
}
