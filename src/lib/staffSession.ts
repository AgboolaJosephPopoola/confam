const STAFF_SESSION_KEY = "paywatch_staff_session";

export interface StaffSession {
  companyId: string;
  companyName: string;
  companyCode: string;
  staffPin: string;
  staffId?: string;
  staffName?: string;
}

export function getStaffSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StaffSession;
  } catch {
    return null;
  }
}

export function setStaffSession(session: StaffSession): void {
  localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
}

export function clearStaffSession(): void {
  localStorage.removeItem(STAFF_SESSION_KEY);
}
