export type DocumentType = 'meeting_notes' | 'spec' | 'email' | 'other';
export type ExtractionStatus = 'pending' | 'processing' | 'done' | 'failed';
export type GenerationStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface Project {
  id: string;
  name: string;
  created_at: string;
}

export interface ExtractedData {
  summary: string;
  decisions: Array<{
    decision: string;
    evidence_quote: string;
  }>;
  risks: Array<{
    risk: string;
    severity_hint: 'explicit' | 'implied';
    evidence_quote: string;
  }>;
  action_items: Array<{
    item: string;
    status: 'open' | 'closed' | 'unclear';
    owner: string | null;
    evidence_quote: string;
  }>;
  open_questions: Array<{
    question: string;
    evidence_quote: string;
  }>;
}

export interface Document {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  document_type: DocumentType;
  document_date: string;
  extraction_status: ExtractionStatus;
  extracted_data: ExtractedData | null;
  error_message: string | null;
  created_at: string;
}

export interface AggregatedData {
  project_name: string;
  documents_analyzed: string[];
  executive_summary: string;
  merged_risks: Array<{
    risk: string;
    mentioned_in: string[];
    severity_hint: 'explicit' | 'implied';
    trend: 'new' | 'recurring' | 'escalating';
    evidence_quotes: Array<{
      document_id: string;
      quote: string;
    }>;
  }>;
  action_items_summary: {
    total: number;
    open: number;
    closed: number;
    unclear: number;
    by_document: Array<{
      document_id: string;
      open: number;
      closed: number;
      unclear: number;
    }>;
  };
  decisions_timeline: Array<{
    decision: string;
    document_id: string;
    document_date: string;
  }>;
  open_questions_unresolved: Array<{
    question: string;
    document_id: string;
    evidence_quote: string;
  }>;
  conflicts_detected: Array<{
    description: string;
    document_ids: string[];
  }>;
}

export interface Report {
  id: string;
  project_id: string;
  aggregated_data: AggregatedData;
  generated_at: string;
  generation_status: GenerationStatus;
  error_message: string | null;
}
