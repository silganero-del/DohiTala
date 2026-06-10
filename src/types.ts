export interface Statement {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
}

export interface Debate {
  id: string;
  title: string;
  createdAt: number;
  status: "Ouvert" | "Résolu";
  conclusion: string;
  ownerId: string;
}
