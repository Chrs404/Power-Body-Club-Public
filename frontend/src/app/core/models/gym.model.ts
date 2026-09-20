export type WeekDay =
  | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY'
  | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  MONDAY: 'Lunedì',
  TUESDAY: 'Martedì',
  WEDNESDAY: 'Mercoledì',
  THURSDAY: 'Giovedì',
  FRIDAY: 'Venerdì',
  SATURDAY: 'Sabato',
  SUNDAY: 'Domenica',
};

export interface DaySchedule {
  dayOfWeek: WeekDay;
  slots: { openTime: string; closeTime: string }[];
}

export interface Closure {
  id: number;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface News {
  id: number;
  title: string;
  content: string;
  imageUrl: string | null;
  publishedAt: string;
  isPublished?: boolean;
}

export interface NewsInput {
  title: string;
  content: string;
  imageUrl?: string;
  isPublished?: boolean;
}

export interface ClosureInput {
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ScheduleInput {
  days: { dayOfWeek: WeekDay; slots: { openTime: string; closeTime: string }[] }[];
}

export interface ClientDashboard {
  user: {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
  subscription: {
    startDate: string;
    endDate: string;
    plan: string | null;
    daysLeft: number | null;
    expired: boolean;
  } | null;
  activeWorkout: {
    id: number;
    name: string;
    startDate: string;
    endDate: string | null;
    _count: { days: number };
  } | null;
  latestNews: News | null;
  upcomingClosures: Closure[];
}
