"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { cn } from "~/app/lib/utils";
import { ChevronDown, Search, Check, Globe } from "lucide-react";

// Common timezones grouped by region
const TIMEZONES = [
  // UTC
  { value: "UTC", label: "UTC", region: "UTC" },

  // Americas
  { value: "America/New_York", label: "New York (EST/EDT)", region: "Americas" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)", region: "Americas" },
  { value: "America/Denver", label: "Denver (MST/MDT)", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)", region: "Americas" },
  { value: "America/Anchorage", label: "Anchorage (AKST/AKDT)", region: "Americas" },
  { value: "America/Phoenix", label: "Phoenix (MST)", region: "Americas" },
  { value: "America/Toronto", label: "Toronto (EST/EDT)", region: "Americas" },
  { value: "America/Vancouver", label: "Vancouver (PST/PDT)", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City (CST/CDT)", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)", region: "Americas" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (ART)", region: "Americas" },

  // Europe
  { value: "Europe/London", label: "London (GMT/BST)", region: "Europe" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)", region: "Europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)", region: "Europe" },
  { value: "Europe/Brussels", label: "Brussels (CET/CEST)", region: "Europe" },
  { value: "Europe/Rome", label: "Rome (CET/CEST)", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid (CET/CEST)", region: "Europe" },
  { value: "Europe/Zurich", label: "Zurich (CET/CEST)", region: "Europe" },
  { value: "Europe/Vienna", label: "Vienna (CET/CEST)", region: "Europe" },
  { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)", region: "Europe" },
  { value: "Europe/Oslo", label: "Oslo (CET/CEST)", region: "Europe" },
  { value: "Europe/Copenhagen", label: "Copenhagen (CET/CEST)", region: "Europe" },
  { value: "Europe/Helsinki", label: "Helsinki (EET/EEST)", region: "Europe" },
  { value: "Europe/Warsaw", label: "Warsaw (CET/CEST)", region: "Europe" },
  { value: "Europe/Prague", label: "Prague (CET/CEST)", region: "Europe" },
  { value: "Europe/Budapest", label: "Budapest (CET/CEST)", region: "Europe" },
  { value: "Europe/Bucharest", label: "Bucharest (EET/EEST)", region: "Europe" },
  { value: "Europe/Athens", label: "Athens (EET/EEST)", region: "Europe" },
  { value: "Europe/Istanbul", label: "Istanbul (TRT)", region: "Europe" },
  { value: "Europe/Moscow", label: "Moscow (MSK)", region: "Europe" },
  { value: "Europe/Kiev", label: "Kyiv (EET/EEST)", region: "Europe" },

  // Asia
  { value: "Asia/Dubai", label: "Dubai (GST)", region: "Asia" },
  { value: "Asia/Kolkata", label: "Mumbai/Kolkata (IST)", region: "Asia" },
  { value: "Asia/Bangkok", label: "Bangkok (ICT)", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", region: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)", region: "Asia" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", region: "Asia" },
  { value: "Asia/Seoul", label: "Seoul (KST)", region: "Asia" },
  { value: "Asia/Taipei", label: "Taipei (CST)", region: "Asia" },
  { value: "Asia/Manila", label: "Manila (PHT)", region: "Asia" },
  { value: "Asia/Jakarta", label: "Jakarta (WIB)", region: "Asia" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (ICT)", region: "Asia" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (MYT)", region: "Asia" },

  // Pacific
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)", region: "Pacific" },
  { value: "Pacific/Fiji", label: "Fiji (FJT)", region: "Pacific" },
  { value: "Pacific/Honolulu", label: "Honolulu (HST)", region: "Pacific" },
  { value: "Pacific/Guam", label: "Guam (ChST)", region: "Pacific" },

  // Australia
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)", region: "Australia" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)", region: "Australia" },
  { value: "Australia/Brisbane", label: "Brisbane (AEST)", region: "Australia" },
  { value: "Australia/Perth", label: "Perth (AWST)", region: "Australia" },
  { value: "Australia/Adelaide", label: "Adelaide (ACST/ACDT)", region: "Australia" },

  // Africa
  { value: "Africa/Cairo", label: "Cairo (EET)", region: "Africa" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)", region: "Africa" },
  { value: "Africa/Lagos", label: "Lagos (WAT)", region: "Africa" },
  { value: "Africa/Nairobi", label: "Nairobi (EAT)", region: "Africa" },
  { value: "Africa/Casablanca", label: "Casablanca (WET/WEST)", region: "Africa" },
];

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TimezoneSelect({ value, onChange, className }: TimezoneSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filteredTimezones = TIMEZONES.filter(
    (tz) =>
      tz.label.toLowerCase().includes(search.toLowerCase()) ||
      tz.value.toLowerCase().includes(search.toLowerCase())
  );

  // Group by region
  const groupedTimezones = filteredTimezones.reduce(
    (acc, tz) => {
      if (!acc[tz.region]) acc[tz.region] = [];
      acc[tz.region].push(tz);
      return acc;
    },
    {} as Record<string, typeof TIMEZONES>
  );

  const selectedTimezone = TIMEZONES.find((tz) => tz.value === value);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "hover:bg-secondary/50",
          isOpen && "ring-1 ring-ring"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Globe className="h-4 w-4 text-muted-foreground" />
          {selectedTimezone?.label || value || "Select timezone..."}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-black/20 animate-fade-in">
          {/* Search input */}
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search timezones..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-md border-0 bg-secondary/50 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-[280px] overflow-y-auto p-1">
            {Object.entries(groupedTimezones).map(([region, timezones]) => (
              <div key={region}>
                <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {region}
                </div>
                {timezones.map((tz) => (
                  <button
                    key={tz.value}
                    type="button"
                    onClick={() => {
                      onChange(tz.value);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                      "hover:bg-secondary/80",
                      value === tz.value && "bg-primary/10 text-primary"
                    )}
                  >
                    <span>{tz.label}</span>
                    {value === tz.value && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            ))}
            {filteredTimezones.length === 0 && (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No timezones found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
