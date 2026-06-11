'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { MentorOption } from '@/lib/types'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Enter a valid phone number'),
  whatsapp: z.string().min(10, 'Enter a valid WhatsApp number'),
  year: z.enum(['first', 'second']),
  batch: z.string().min(1, 'Required'),
  section: z.string().min(1, 'Required'),
  roll: z.string().min(1, 'Required'),
  mentor_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  userId: string
  email: string
  mentors: MentorOption[]
}

export default function OnboardingForm({ userId, email, mentors }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      whatsapp: '',
      year: 'first',
      batch: '',
      section: '',
      roll: '',
      mentor_id: undefined,
    },
  })

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      ...values,
      mentor_id: values.mentor_id || null,
    })

    if (error) {
      toast.error('Could not save profile. Please try again.')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input placeholder="Rahul Sharma" className="h-11" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="+91 9876543210" className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="whatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WhatsApp</FormLabel>
                <FormControl>
                  <Input placeholder="+91 9876543210" className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="year"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Year</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="first">1st Year</SelectItem>
                  <SelectItem value="second">2nd Year</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="batch"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Batch</FormLabel>
                <FormControl>
                  <Input placeholder="PGP 25-27" className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="section"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Section</FormLabel>
                <FormControl>
                  <Input placeholder="A" className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="roll"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Roll No.</FormLabel>
                <FormControl>
                  <Input placeholder="P25001" className="h-11" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {mentors.length > 0 && (
          <FormField
            control={form.control}
            name="mentor_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CRISP mentor (optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select your mentor" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {mentors.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <Button
          type="submit"
          className="w-full h-11"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Saving…' : 'Save and continue'}
        </Button>
      </form>
    </Form>
  )
}
