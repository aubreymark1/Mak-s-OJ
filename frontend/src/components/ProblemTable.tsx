import { motion } from 'framer-motion';
import { CheckCircle2, Clock3, Minus } from 'lucide-react';
import { Badge } from './ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import type { ProblemListItem } from '../types/oj';

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' as const },
  },
};

interface ProblemTableProps {
  problems: ProblemListItem[];
  onSelect: (problemId: number) => void;
}

export function ProblemTable({ problems, onSelect }: ProblemTableProps) {
  return (
    <div className="rounded-lg border shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">状态</TableHead>
            <TableHead className="w-[60px]">ID</TableHead>
            <TableHead>题目名称</TableHead>
            <TableHead>知识点标签</TableHead>
            <TableHead className="w-[100px]">难度</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {problems.map((problem, index) => (
            <motion.tr
              key={problem.id}
              variants={rowVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: index * 0.03 }}
              onClick={() => onSelect(problem.id)}
              className="cursor-pointer hover:bg-muted/50 border-b transition-colors"
            >
              <TableCell>
                <StatusBadge userStatus={problem.user_status} />
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">
                {problem.id}
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {problem.title}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  {problem.tags.length ? (
                    problem.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">暂无标签</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <DifficultyBadge difficulty={problem.difficulty} />
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ userStatus }: { userStatus?: 'AC' | 'Attempted' | null }) {
  if (userStatus === 'AC') {
    return (
      <Badge className="gap-1 bg-status-ac/15 text-status-ac border-status-ac/30">
        <CheckCircle2 className="size-3" />
        已通过
      </Badge>
    );
  }

  if (userStatus === 'Attempted') {
    return (
      <Badge className="gap-1 bg-status-wa/15 text-status-wa border-status-wa/30">
        <Minus className="size-3" />
        已尝试
      </Badge>
    );
  }

  return <Clock3 className="size-4 text-muted-foreground" />;
}

function DifficultyBadge({ difficulty }: { difficulty?: string | null }) {
  const colorMap: Record<string, string> = {
    easy: 'text-status-ac',
    medium: 'text-status-wa',
    hard: 'text-status-error',
  };

  const labelMap: Record<string, string> = {
    Easy: '简单',
    Medium: '中等',
    Hard: '困难',
  };

  const key = (difficulty ?? '').toLowerCase();
  const color = colorMap[key] ?? 'text-muted-foreground';
  const label = labelMap[difficulty ?? ''] ?? difficulty ?? '未知';

  return <span className={`text-sm font-medium ${color}`}>{label}</span>;
}
