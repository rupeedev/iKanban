import { useState } from 'react';
import { ChevronDown, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Quick date helper for target date picker
function getQuickDate(
  type: 'day' | 'month' | 'quarter' | 'half' | 'year',
  value: number
): Date {
  const date = new Date();
  switch (type) {
    case 'day':
      date.setDate(date.getDate() + value);
      break;
    case 'month':
      date.setMonth(date.getMonth() + value);
      break;
    case 'quarter':
      date.setMonth(date.getMonth() + value * 3);
      break;
    case 'half':
      date.setMonth(date.getMonth() + value * 6);
      break;
    case 'year':
      date.setFullYear(date.getFullYear() + value);
      break;
  }
  return date;
}

type DateTab = 'day' | 'month' | 'quarter' | 'half' | 'year';

interface TargetDateCellProps {
  targetDate: string | null;
  onSelect: (date: string | null) => void;
}

export function TargetDateCell({ targetDate, onSelect }: TargetDateCellProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DateTab>('day');

  const parsedDate = targetDate ? new Date(targetDate) : undefined;

  const handleSelect = (date: Date | null) => {
    onSelect(date ? date.toISOString() : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {parsedDate ? (
            <span>{format(parsedDate, 'MMM d')}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Tabs
          value={tab}
          onValueChange={(v: string) => setTab(v as DateTab)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-5 h-8">
            <TabsTrigger value="day" className="text-xs">
              Day
            </TabsTrigger>
            <TabsTrigger value="month" className="text-xs">
              Month
            </TabsTrigger>
            <TabsTrigger value="quarter" className="text-xs">
              Quarter
            </TabsTrigger>
            <TabsTrigger value="half" className="text-xs">
              Half
            </TabsTrigger>
            <TabsTrigger value="year" className="text-xs">
              Year
            </TabsTrigger>
          </TabsList>
          <TabsContent value="day" className="p-2 space-y-1">
            {[1, 3, 7, 14, 30].map((days) => (
              <Button
                key={days}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => handleSelect(getQuickDate('day', days))}
              >
                In {days} day{days > 1 ? 's' : ''}
              </Button>
            ))}
          </TabsContent>
          <TabsContent value="month" className="p-2 space-y-1">
            {[1, 2, 3, 6].map((months) => (
              <Button
                key={months}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => handleSelect(getQuickDate('month', months))}
              >
                In {months} month{months > 1 ? 's' : ''}
              </Button>
            ))}
          </TabsContent>
          <TabsContent value="quarter" className="p-2 space-y-1">
            {[1, 2, 3, 4].map((quarters) => (
              <Button
                key={quarters}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => handleSelect(getQuickDate('quarter', quarters))}
              >
                In {quarters} quarter{quarters > 1 ? 's' : ''}
              </Button>
            ))}
          </TabsContent>
          <TabsContent value="half" className="p-2 space-y-1">
            {[1, 2].map((halves) => (
              <Button
                key={halves}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => handleSelect(getQuickDate('half', halves))}
              >
                In {halves} half-year{halves > 1 ? 's' : ''}
              </Button>
            ))}
          </TabsContent>
          <TabsContent value="year" className="p-2 space-y-1">
            {[1, 2, 3].map((years) => (
              <Button
                key={years}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => handleSelect(getQuickDate('year', years))}
              >
                In {years} year{years > 1 ? 's' : ''}
              </Button>
            ))}
          </TabsContent>
        </Tabs>
        <div className="border-t">
          <Calendar
            mode="single"
            selected={parsedDate}
            onSelect={(date) => handleSelect(date ?? null)}
          />
        </div>
        {parsedDate && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => handleSelect(null)}
            >
              Clear target date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
