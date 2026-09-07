import { metricsDictionary } from '@/data/metrics-dictionary';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Folder, FileText, ArrowLeft } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';
import Link from 'next/link';

export default function DictionaryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="w-full max-w-[1920px] mx-auto px-4 md:px-8 lg:px-12 pt-8 mb-8 border-b border-border pb-4 flex items-center gap-4">
        <Link href="/" className="hover:bg-muted p-2 rounded-full transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Справочник метрик</h1>
          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            v{APP_VERSION}
          </span>
        </div>
      </div>

      <div className="w-full max-w-[1920px] mx-auto px-4 md:px-8 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
          {metricsDictionary.map((category) => (
            <div key={category.id} className="flex flex-col gap-4">
              <div className="flex items-center gap-4 mb-2">
                <Folder className="h-8 w-8 text-muted-foreground fill-current opacity-80" />
                <h2 className="text-2xl font-semibold">
                  {category.title} <span className="text-muted-foreground text-lg font-normal ml-1">({category.metrics.length})</span>
                </h2>
              </div>
              
              <Accordion multiple className="w-full">
                {category.metrics.map((metric, idx) => (
                  <AccordionItem key={idx} value={`${category.id}-${idx}`} className="border-b-0 mb-1">
                    <AccordionTrigger className="hover:no-underline py-2.5 justify-start gap-3 text-left w-full hover:bg-muted/50 px-2 rounded-md transition-colors [&>svg:last-child]:hidden">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <span className="text-base font-medium">{metric.name}</span>
                    </AccordionTrigger>
                    <AccordionContent className="pl-10 pr-4 py-3 text-sm text-muted-foreground leading-relaxed bg-muted/20 rounded-md mt-1 border border-border/50 space-y-3">
                      <p>{metric.description}</p>
                      {metric.generalFormula && (
                        <div className="bg-background/50 p-2.5 rounded border border-border/50">
                          <span className="font-semibold text-foreground/80 block mb-1 text-xs">Общая формула:</span>
                          <code className="text-[11px] bg-muted/50 px-1.5 py-0.5 rounded text-foreground font-mono">{metric.generalFormula}</code>
                        </div>
                      )}
                      {metric.projectFormula && (
                        <div className="bg-background/50 p-2.5 rounded border border-border/50">
                          <span className="font-semibold text-foreground/80 block mb-1 text-xs">Формула в проекте:</span>
                          <span className="text-xs block text-foreground/80">{metric.projectFormula}</span>
                        </div>
                      )}
                      {metric.nuances && (
                        <div className="flex gap-2 items-start p-2.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded border border-yellow-500/20">
                          <span className="text-base leading-none">💡</span>
                          <span className="text-xs mt-0.5 leading-snug">{metric.nuances}</span>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
