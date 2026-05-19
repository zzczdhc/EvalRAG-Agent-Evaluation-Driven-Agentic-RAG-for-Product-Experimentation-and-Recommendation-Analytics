import { NextResponse } from "next/server";
import { mockResult } from "@/lib/mock-data";
import type { AnalyzeRequest } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as AnalyzeRequest;

  // TODO: Connect this route to the real EvalRAG backend.
  // Suggested integration path:
  // - If no CSV is provided, POST body.question to FastAPI /ask.
  // - If CSV is provided, upload the file or file reference to FastAPI /analyze.
  // - Map EvalRAG's answer, retrieved_chunks, tool_summary, and evaluation fields
  //   into the AnalysisResult shape used by the frontend.
  await new Promise((resolve) => setTimeout(resolve, 650));

  return NextResponse.json({
    ...mockResult,
    summary: body.csvFileName
      ? `${mockResult.summary} Uploaded file detected: ${body.csvFileName}.`
      : mockResult.summary,
  });
}
