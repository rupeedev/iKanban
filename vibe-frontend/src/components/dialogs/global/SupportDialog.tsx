import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageCircleQuestion, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';

const SupportDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = name.trim() !== '' && email.trim() !== '' && message.trim() !== '';

  const handleSubmit = async () => {
    if (!isValid) return;

    setIsSubmitting(true);

    // Simulate a brief delay for better UX (no actual backend call)
    await new Promise((resolve) => setTimeout(resolve, 500));

    setIsSubmitting(false);

    // Show success toast
    toast.success('Message sent!', {
      description: 'Thank you for reaching out. We\'ll get back to you soon.',
    });

    // Close the dialog
    modal.hide();
  };

  const handleClose = () => {
    modal.hide();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <MessageCircleQuestion className="h-6 w-6 text-primary" />
            <DialogTitle>Contact Support</DialogTitle>
          </div>
          <DialogDescription>
            Have a question or need help? Send us a message and we'll get back to you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="support-name">Name</Label>
            <Input
              id="support-name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-email">Email</Label>
            <Input
              id="support-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-message">Message</Label>
            <Textarea
              id="support-message"
              placeholder="How can we help you?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const SupportDialog = defineModal<void, void>(SupportDialogImpl);
