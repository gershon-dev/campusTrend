// Add click handlers when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const levelCards = document.querySelectorAll('.course-card');
    const faculty = 'General Papers';
    
    levelCards.forEach(card => {
        // Make cards keyboard accessible
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        
        card.addEventListener('click', function() {
            const levelText = this.getAttribute('data-course'); // e.g., "Level 100"
            const level = levelText.replace('Level ', ''); // Extract just "100"
            
            // Navigate directly to semesters page since General papers already has levels
            window.location.href = `semesters.html?department=General%20Papers&faculty=${encodeURIComponent(faculty)}&level=${level}`;
        });
        
        // Add keyboard navigation
        card.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
        
        // Add focus effects
        card.addEventListener('focus', function() {
            this.style.outline = '3px solid #667eea';
            this.style.outlineOffset = '2px';
        });
        
        card.addEventListener('blur', function() {
            this.style.outline = 'none';
        });
    });
});

// Add loading animation
window.addEventListener('load', function() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
});