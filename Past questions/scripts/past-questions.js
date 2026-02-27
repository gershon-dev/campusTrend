// Navigation function for faculty selection
function navigateToFaculty(faculty) {
    // Exact filename map — mobile file systems are case-sensitive
    const fileMap = {
        'social-Science': 'social-Science.html',
        'General':        'General.html',
        'science':        'science.html',
        'business':       'business.html'
    };

    const file = fileMap[faculty];
    if (file) {
        window.location.href = file;
    } else {
        console.error('Unknown faculty:', faculty);
    }
}

// Add keyboard accessibility
document.addEventListener('DOMContentLoaded', function() {
    const cards = document.querySelectorAll('.faculty-card');
    
    cards.forEach(card => {
        // Make cards keyboard accessible
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        
        // Add keyboard navigation
        card.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
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

// Optional: Add a simple loading animation
window.addEventListener('load', function() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
});